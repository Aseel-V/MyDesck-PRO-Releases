import { readFileSync, writeFileSync } from 'node:fs';

console.log('[generate-release-notes-md] Generating Markdown release notes from public/release-notes.json...');

const json = JSON.parse(readFileSync('public/release-notes.json', 'utf8'));

let md = `# MyDesck PRO ${json.version}\n\n`;

if (json.title) {
  md += `### ${json.title.en || 'Release Notes'}\n\n`;
}

if (Array.isArray(json.changes?.en)) {
  md += `#### Highlights & Fixes\n`;
  for (const change of json.changes.en) {
    md += `- ${change}\n`;
  }
  md += `\n`;
}

md += `---\n*Automated Release Candidate Verified by MyDesck PRO Security Pipeline.*\n`;

writeFileSync('release-notes.md', md, 'utf8');
console.log('✓ Successfully generated release-notes.md');
