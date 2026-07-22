const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const tempFiles = [
  'src/commit_log.txt',
  'scripts/commit_real_identifiers_runner.cjs',
  'powershell.bat'
];

for (const relPath of tempFiles) {
  const fullPath = path.join(root, relPath);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {}
  }
}
console.log('Cleaned scratch debug files.');
