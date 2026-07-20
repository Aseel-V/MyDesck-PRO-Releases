import { readFileSync } from 'node:fs';

const resources = Object.fromEntries(['en', 'ar', 'he'].map((language) => [language, JSON.parse(readFileSync(`src/i18n/locales/${language}.json`, 'utf8'))]));
const issues = [];

function visit(value, path, language) {
  if (value === null || value === undefined) issues.push(`${language} null value: ${path}`);
  if (typeof value === 'string' && !value.trim()) issues.push(`${language} empty value: ${path}`);
  if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key, language));
}
function compare(reference, candidate, path, language) {
  for (const [key, value] of Object.entries(reference)) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in candidate)) { issues.push(`${language} missing key: ${next}`); continue; }
    if (typeof value !== typeof candidate[key]) issues.push(`${language} type mismatch: ${next}`);
    else if (value && typeof value === 'object') compare(value, candidate[key], next, language);
  }
  for (const key of Object.keys(candidate)) if (!(key in reference)) issues.push(`${language} extra key: ${path ? `${path}.` : ''}${key}`);
}
for (const language of ['en', 'ar', 'he']) visit(resources[language], '', language);
compare(resources.en, resources.ar, '', 'ar');
compare(resources.en, resources.he, '', 'he');
if (issues.length) { console.error(issues.join('\n')); process.exit(1); }
console.log('i18n structure check passed');
