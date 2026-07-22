const identifierPattern = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';

function normalizeIdentifier(identifier) {
  const value = identifier.trim();
  if (value.startsWith('"')) return value.slice(1, -1).replace(/""/g, '"');
  return value.toLowerCase();
}

function splitCommaSeparated(value) {
  const parts = [];
  let current = '';
  let quoted = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      current += character;
      if (quoted && value[index + 1] === '"') {
        current += value[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === '(') depth += 1;
    if (!quoted && character === ')') depth -= 1;
    if (!quoted && depth === 0 && character === ',') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let blockCommentDepth = 0;
  let lineComment = false;
  let dollarTag = null;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        current += '\n';
      }
      index += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (character === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 2;
      } else if (character === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        if (character === '\n') current += '\n';
        index += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        current += character;
        index += 1;
      }
      continue;
    }

    if (singleQuoted) {
      current += character;
      if (character === "'" && next === "'") {
        current += next;
        index += 2;
      } else {
        if (character === "'") singleQuoted = false;
        index += 1;
      }
      continue;
    }

    if (doubleQuoted) {
      current += character;
      if (character === '"' && next === '"') {
        current += next;
        index += 2;
      } else {
        if (character === '"') doubleQuoted = false;
        index += 1;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      if (current && !/\s$/.test(current)) current += ' ';
      lineComment = true;
      index += 2;
      continue;
    }
    if (character === '/' && next === '*') {
      if (current && !/\s$/.test(current)) current += ' ';
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      current += character;
      index += 1;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      current += character;
      index += 1;
      continue;
    }
    if (character === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }
    if (character === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function parseRoutinePrivilegeStatement(statement) {
  let normalized = statement.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(GRANT|REVOKE)\s+(EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+FUNCTION\s+(.+)\s+(TO|FROM)\s+(.+)$/i);
  if (!match) return null;

  const action = match[1].toLowerCase();
  const direction = match[4].toLowerCase();
  if ((action === 'grant' && direction !== 'to') || (action === 'revoke' && direction !== 'from')) return null;

  let granteeText = match[5].trim();
  if (action === 'grant') granteeText = granteeText.replace(/\s+WITH\s+GRANT\s+OPTION$/i, '');
  if (action === 'revoke') granteeText = granteeText.replace(/\s+(?:CASCADE|RESTRICT)$/i, '');

  const routineMatch = match[3].trim().match(new RegExp(`^(${identifierPattern})\\s*\\.\\s*(${identifierPattern})\\s*\\((.*)\\)$`, 's'));
  if (!routineMatch) return null;

  const grantees = splitCommaSeparated(granteeText).map(normalizeIdentifier);
  if (!grantees.length || grantees.some((grantee) => !grantee)) return null;

  return {
    action,
    privilege: match[2].replace(/\s+/g, ' ').toLowerCase(),
    schema: normalizeIdentifier(routineMatch[1]),
    functionName: normalizeIdentifier(routineMatch[2]),
    argumentTypes: splitCommaSeparated(routineMatch[3]).map((type) => type.replace(/\s+/g, ' ').trim().toLowerCase()),
    grantees,
  };
}

export function hasEffectiveRoutineExecuteGrant(migrations, target) {
  const expectedSchema = target.schema.toLowerCase();
  const expectedName = target.functionName.toLowerCase();
  const expectedTypes = target.argumentTypes?.map((type) => type.replace(/\s+/g, ' ').trim().toLowerCase());
  const expectedGrantee = target.grantee.toLowerCase();
  const effectiveGrantees = new Set();

  for (const migration of migrations) {
    for (const statement of splitSqlStatements(migration.sql)) {
      const parsed = parseRoutinePrivilegeStatement(statement);
      if (!parsed) continue;
      if (parsed.schema !== expectedSchema || parsed.functionName !== expectedName) continue;
      if (expectedTypes && (parsed.argumentTypes.length !== expectedTypes.length || parsed.argumentTypes.some((type, index) => type !== expectedTypes[index]))) continue;

      if (parsed.action === 'grant' && parsed.privilege === 'execute') {
        parsed.grantees.forEach((grantee) => effectiveGrantees.add(grantee));
      } else if (parsed.action === 'revoke' && (parsed.privilege === 'execute' || parsed.privilege.startsWith('all'))) {
        parsed.grantees.forEach((grantee) => effectiveGrantees.delete(grantee));
      }
    }
  }

  return effectiveGrantees.has(expectedGrantee);
}
