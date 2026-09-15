/**
 * Firestore Security Rules evaluation budget.
 *
 * Firestore evaluates at most 1,000 expressions for a request and refuses the request when a rule
 * needs more, so a correct but expensive rule fails in production exactly like a forbidden write.
 * The emulator enforces the same limit but does not report how many expressions a request used, so
 * the cost is measured: the allow expression under test is prefixed with a balanced conjunction of
 * `true` literals. A literal costs 1 and each `&&` costs 2 (calibrated on the emulator: 334 literals
 * fit, 335 do not), so P literals plus the `&&` that joins them to the rule cost exactly 3P, and the
 * largest P for which the request is still allowed brackets the rule's own cost:
 *
 *   1000 - 3(P + 1) < cost <= 1000 - 3P
 *
 * Calibration facts the validators are designed around (same method, emulator 2026-09):
 *   - function arguments and `let` bindings are evaluated once, not per reference
 *   - each identifier, literal, member access, call, comparison and `!` costs 1; `&&` and `||` cost 2
 *     when both sides are evaluated
 *   - list and set operations (`hasAny`, `hasOnly`, `in`), `diff().affectedKeys()`, deep map/list
 *     equality and regular expressions cost a constant: a list literal costs its element count, not
 *     the size of the document or set it is compared with
 */

export const EXPRESSION_LIMIT = 1000;
const LITERAL_UNIT = 3;
const MAX_PADDING = Math.ceil(EXPRESSION_LIMIT / LITERAL_UNIT);
const BUDGET_MESSAGE = /maximum of 1000 expressions/;

function balanced(items) {
  if (items.length === 1) return items[0];
  const middle = Math.floor(items.length / 2);
  return `(${balanced(items.slice(0, middle))} && ${balanced(items.slice(middle))})`;
}

/** P literals joined by a balanced tree (a left-nested chain of hundreds fails compilation on depth). */
export function padding(count) {
  return count === 0 ? '' : `${balanced(Array.from({ length: count }, () => 'true'))} && `;
}

/** Index of the `;` ending the Rules expression that starts at `start`; strings and comments are skipped. */
function expressionEnd(text, start) {
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      if (newline < 0) break;
      i = newline;
    } else if (ch === ';') {
      return i;
    }
  }
  throw new Error('RULES_EXPRESSION_UNTERMINATED');
}

/**
 * The expression of one allow statement: the first `allow` with the given prefix inside the block
 * opened by a unique match header, before any nested match.
 */
export function locateAllow(rules, { match, allow }) {
  const header = rules.indexOf(match);
  if (header < 0 || rules.indexOf(match, header + 1) >= 0) throw new Error(`RULES_MATCH_NOT_UNIQUE:${match}`);
  const statement = rules.indexOf(allow, header + match.length);
  const nested = rules.indexOf('match /', header + match.length);
  if (statement < 0 || (nested >= 0 && nested < statement)) throw new Error(`RULES_ALLOW_NOT_IN_BLOCK:${match}:${allow}`);
  const start = statement + allow.length;
  return { start, end: expressionEnd(rules, start) };
}

/** Top-level `&&` operands of an expression, for attributing a cost to its parts. */
export function conjuncts(expression) {
  const parts = [];
  let depth = 0; let quote = null; let from = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '/' && expression[i + 1] === '/') i = expression.indexOf('\n', i) < 0 ? expression.length : expression.indexOf('\n', i);
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (depth === 0 && ch === '&' && expression[i + 1] === '&') {
      parts.push(expression.slice(from, i).trim());
      from = i + 2;
      i += 1;
    }
  }
  parts.push(expression.slice(from).trim());
  return parts.filter(Boolean).map((part) => part.replace(/\/\/[^\n]*\n/g, '\n').trim());
}

export function allowExpression(rules, target) {
  const { start, end } = locateAllow(rules, target);
  return rules.slice(start, end);
}

/** The Rules with one allow expression padded and, optionally, replaced. */
export function rewriteAllow(rules, target, { padding: count = 0, expression } = {}) {
  const { start, end } = locateAllow(rules, target);
  const body = expression ?? rules.slice(start, end);
  return `${rules.slice(0, start)}${padding(count)}(${body})${rules.slice(end)}`;
}

/** Runs one client operation and classifies a Rules refusal instead of throwing it. */
export async function outcome(operation) {
  try {
    await operation();
    return { allowed: true, message: '' };
  } catch (error) {
    if (error?.code === 'permission-denied') return { allowed: false, message: String(error.message) };
    throw error;
  }
}

/**
 * Measures one allow statement. `attempt` performs a fresh request that the unpadded rule allows and
 * resolves to an `outcome`. The committed Rules are reloaded afterwards.
 */
export async function measureRuleCost({ rules, target, load, attempt, expression }) {
  const run = async (count) => {
    await load(rewriteAllow(rules, target, { padding: count, expression }));
    const result = await attempt();
    if (!result.allowed && !BUDGET_MESSAGE.test(result.message)) {
      throw new Error(`RULES_DENIED_FOR_A_REASON_OTHER_THAN_COST:${result.message}`);
    }
    return result.allowed;
  };
  try {
    if (!(await run(0))) return { withinLimit: false, costAtMost: null, costAbove: EXPRESSION_LIMIT };
    let low = 0; let high = MAX_PADDING;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (await run(middle)) low = middle; else high = middle;
    }
    return { withinLimit: true, costAtMost: EXPRESSION_LIMIT - LITERAL_UNIT * low, costAbove: EXPRESSION_LIMIT - LITERAL_UNIT * (low + 1) };
  } finally {
    await load(rules);
  }
}
