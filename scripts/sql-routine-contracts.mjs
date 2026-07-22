import { splitCommaSeparated, splitSqlStatements } from './sql-routine-grants.mjs';

const identifierPattern = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';

function normalizeIdentifier(identifier) {
  const value = identifier.trim();
  return value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value.toLowerCase();
}

function normalizeType(type) {
  return type.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findClosingParenthesis(statement, openingIndex) {
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = openingIndex; index < statement.length; index += 1) {
    const character = statement[index];
    const next = statement[index + 1];
    if (singleQuoted) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === '"') doubleQuoted = true;
    else if (character === '(') depth += 1;
    else if (character === ')' && --depth === 0) return index;
  }
  return -1;
}

function parseArgument(argument) {
  const withoutDefault = argument.replace(/\s+(?:DEFAULT|=)\s+[\s\S]*$/i, '').trim();
  const match = withoutDefault.match(new RegExp(`^(?:IN\\s+)?(${identifierPattern})\\s+(.+)$`, 'i'));
  if (!match) throw new Error(`Unsupported function argument declaration: ${argument}`);
  return { name: normalizeIdentifier(match[1]), type: normalizeType(match[2]) };
}

export function parseRoutineDefinition(statement) {
  const header = statement.match(new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(${identifierPattern})\\s*\\.\\s*(${identifierPattern})\\s*\\(`, 'i'));
  if (!header) return null;

  const openingIndex = header[0].lastIndexOf('(');
  const closingIndex = findClosingParenthesis(statement, openingIndex);
  if (closingIndex < 0) throw new Error(`Unclosed argument list for ${header[1]}.${header[2]}`);

  const returnsMatch = statement.slice(closingIndex + 1).match(/^\s*RETURNS\s+([^\s]+(?:\s+with\s+time\s+zone)?)/i);
  if (!returnsMatch) throw new Error(`Missing return type for ${header[1]}.${header[2]}`);
  const argumentText = statement.slice(openingIndex + 1, closingIndex).trim();

  return {
    schema: normalizeIdentifier(header[1]),
    name: normalizeIdentifier(header[2]),
    arguments: argumentText ? splitCommaSeparated(argumentText).map(parseArgument) : [],
    returnType: normalizeType(returnsMatch[1]),
  };
}

export function findLatestRoutineDefinition(migrations, target) {
  const expectedSchema = target.schema.toLowerCase();
  const expectedName = target.functionName.toLowerCase();
  let latest = null;

  for (const migration of migrations) {
    for (const statement of splitSqlStatements(migration.sql)) {
      const definition = parseRoutineDefinition(statement);
      if (definition?.schema === expectedSchema && definition.name === expectedName) {
        latest = { ...definition, migration: migration.name };
      }
    }
  }
  return latest;
}
