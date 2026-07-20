import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('src/i18n/translations.ts', 'utf8');
const names = { en: 'englishDictionary', ar: 'arabicDictionary', he: 'hebrewDictionary' };

function extractObject(name) {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`Dictionary not found: ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (!escaped && char === quote) quote = '';
      escaped = !escaped && char === '\\';
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`Unclosed dictionary: ${name}`);
}

mkdirSync('src/i18n/locales', { recursive: true });
const english = Function(`return (${extractObject(names.en)});`)();
for (const [language, name] of Object.entries(names)) {
  const value = language === 'en'
    ? english
    : Function('englishDictionary', `return (${extractObject(name)});`)(english);
  writeFileSync(`src/i18n/locales/${language}.json`, `${JSON.stringify(value, null, 2)}\n`);
}
