/**
 * Import-graph and Supabase call-site analysis on the TypeScript AST.
 *
 * The earlier measurement matched text with regular expressions. A lint comment placed between
 * `supabase` and `.from(` hid real database calls from it, and a commented-out call would have been
 * counted as live. Parsing with the TypeScript compiler removes both failure modes: comments and
 * string contents are not code, and a call chain is a call chain however it is formatted.
 *
 * Categories (a Supabase client is any identifier whose name starts with `supabase`, matching the
 * convention the rest of the evidence uses):
 *   database        <client>.from(...)
 *   rpc             <client>.rpc(...)
 *   auth            <client>.auth...
 *   realtime        <client>.channel(...) / <client>.removeChannel(...)
 *   edgeFunctions   <client>.functions.invoke(...)
 *   storage         <client>.storage...  or getStorageBackend()
 * plus imports of the Firebase SDK surfaces and of Supabase modules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

export function resolveSpecifier(from, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = resolve('src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  else return null;
  const direct = extname(base) && existsSync(base) ? [base] : [];
  const candidates = [...direct, ...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`))];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const toRepoPath = (file) => relative('.', file).replaceAll('\\', '/');

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Parentheses, `as`, `<T>` assertions, `satisfies` and `!` do not change the value an expression evaluates to. */
function isTransparent(node) {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node) || Boolean(ts.isSatisfiesExpression?.(node));
}

/** The expression inside any transparent wrappers. */
function unwrap(node) {
  let current = node;
  while (isTransparent(current)) current = current.expression;
  return current;
}

/** The outermost transparent wrapper around a node: the value the surrounding code actually uses. */
function outermost(node) {
  let current = node;
  while (current.parent && isTransparent(current.parent)) current = current.parent;
  return current;
}

/** The leftmost identifier of a property-access chain, unwrapping transparent wrappers. */
function rootIdentifier(node) {
  let current = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) current = current.expression;
    else if (isTransparent(current)) current = current.expression;
    else if (ts.isCallExpression(current)) current = current.expression;
    else break;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

const CLIENT_METHODS = { from: 'database', rpc: 'rpc', channel: 'realtime', removeChannel: 'realtime' };

export function analyzeFile(file) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const facts = { imports: [], calls: [] };
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const record = (kind, node, target) => facts.calls.push({ kind, line: line(node), target });
  const calledWith = (node) => {
    const used = outermost(node);
    return ts.isCallExpression(used.parent) && used.parent.expression === used ? used.parent : null;
  };

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly) : node.isTypeOnly;
      facts.imports.push({ specifier: node.moduleSpecifier.text, typeOnly, line: line(node) });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      facts.imports.push({ specifier: node.arguments[0].text, typeOnly: false, dynamic: true, line: line(node) });
    }
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      const receiver = unwrap(node.expression);
      // `(supabase as any).from(...)`, `(supabase.rpc as any)(...)` and `const rpc = supabase.rpc` are the same calls.
      if (ts.isIdentifier(receiver) && /^supabase/i.test(receiver.text)) {
        const used = outermost(node);
        const member = ts.isPropertyAccessExpression(used.parent) && used.parent.expression === used ? used.parent : null;
        if (Object.hasOwn(CLIENT_METHODS, name)) {
          // A method taken off the client without being called at once (an alias, a bind, a cast callee) is still that call.
          const call = calledWith(node);
          const argument = call?.arguments[0];
          const target = argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
            ? argument.text : call ? '<dynamic>' : '<alias>';
          record(CLIENT_METHODS[name], node, target);
        } else if (name === 'auth') {
          record('auth', node, member ? member.name.text : '<property>');
        } else if (name === 'storage') {
          record('storage', node, null);
        } else if (name === 'functions' && member?.name.text === 'invoke') {
          const argument = calledWith(member)?.arguments[0];
          record('edgeFunctions', node, argument && ts.isStringLiteral(argument) ? argument.text : '<dynamic>');
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'getStorageBackend') {
      record('storage', node, null);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}

/**
 * Every source file reachable from `entry`, with its facts. Type-only imports are followed too:
 * they are erased at build time, but a type-only edge to a runtime module is still worth seeing, and
 * the call-site facts of such a module do not run unless a value import also reaches it. Reachability
 * is reported both ways.
 */
export function analyzeGraph(entry) {
  const facts = new Map();
  const runtime = new Set();
  const pending = [{ file: normalize(resolve(entry)), runtimeEdge: true }];
  const visited = new Map();
  while (pending.length) {
    const { file, runtimeEdge } = pending.pop();
    const seenRuntime = visited.get(file);
    if (seenRuntime === true || (seenRuntime === false && !runtimeEdge)) continue;
    visited.set(file, runtimeEdge || seenRuntime === true);
    if (runtimeEdge) runtime.add(file);
    if (!facts.has(file)) facts.set(file, analyzeFile(file));
    for (const item of facts.get(file).imports) {
      const target = resolveSpecifier(file, item.specifier);
      if (!target) continue;
      pending.push({ file: normalize(target), runtimeEdge: runtimeEdge && !item.typeOnly });
    }
  }
  const files = [...facts.keys()].map(toRepoPath).sort();
  const runtimeFiles = new Set([...runtime].map(toRepoPath));
  const byFile = new Map([...facts].map(([file, value]) => [toRepoPath(file), value]));
  return { entry, files, runtimeFiles, byFile };
}

export const FORBIDDEN_CATEGORIES = ['database', 'rpc', 'auth', 'realtime', 'edgeFunctions'];

/** Totals and carriers for one composition root. Only runtime-reachable files count. */
export function measureRoot(entry, { storageAllowlist = [] } = {}) {
  if (!existsSync(entry)) return { entry, present: false };
  const graph = analyzeGraph(entry);
  const totals = { database: 0, rpc: 0, auth: 0, realtime: 0, edgeFunctions: 0, storage: 0 };
  const carriers = Object.fromEntries(Object.keys(totals).map((key) => [key, []]));
  const sites = [];
  const imports = { genericSupabaseClient: [], supabaseJs: [], supabaseAdapters: [], firebaseStorage: [],
    firebaseFunctions: [], firestore: [], firebaseAuth: [], firebaseAdmin: [] };
  for (const file of graph.files) {
    if (!graph.runtimeFiles.has(file)) continue;
    const fileFacts = graph.byFile.get(file);
    const counts = {};
    for (const call of fileFacts.calls) {
      totals[call.kind] += 1;
      counts[call.kind] = (counts[call.kind] ?? 0) + 1;
      sites.push({ file, ...call });
    }
    for (const [kind, count] of Object.entries(counts)) carriers[kind].push({ file, count });
    for (const item of fileFacts.imports) {
      if (item.typeOnly) continue;
      const target = resolveSpecifier(resolve(file), item.specifier);
      const repoTarget = target ? toRepoPath(target) : null;
      if (repoTarget === 'src/lib/supabase.ts') imports.genericSupabaseClient.push({ file, line: item.line });
      if (repoTarget?.startsWith('src/data/supabase/')) imports.supabaseAdapters.push({ file, target: repoTarget, line: item.line });
      if (item.specifier === '@supabase/supabase-js') imports.supabaseJs.push({ file, line: item.line });
      if (/^firebase\/storage$/.test(item.specifier)) imports.firebaseStorage.push({ file, line: item.line });
      if (/^firebase\/functions$/.test(item.specifier)) imports.firebaseFunctions.push({ file, line: item.line });
      if (/^firebase\/firestore$/.test(item.specifier)) imports.firestore.push({ file, line: item.line });
      if (/^firebase\/auth$/.test(item.specifier)) imports.firebaseAuth.push({ file, line: item.line });
      if (/^firebase-admin/.test(item.specifier)) imports.firebaseAdmin.push({ file, line: item.line });
    }
  }
  const storageOutsideAllowlist = carriers.storage.filter((carrier) => !storageAllowlist.includes(carrier.file));
  const supabaseJsOutsideStorageClient = imports.supabaseJs.filter((item) => item.file !== 'src/data/supabaseStorageClient.ts');
  return {
    entry, present: true, reachableFiles: graph.files.length, runtimeReachableFiles: graph.runtimeFiles.size,
    ...totals, forbiddenTotal: FORBIDDEN_CATEGORIES.reduce((sum, key) => sum + totals[key], 0),
    carriers, sites, imports, storageOutsideAllowlist, supabaseJsOutsideStorageClient,
    files: graph.files, runtimeFiles: [...graph.runtimeFiles].sort(),
  };
}
