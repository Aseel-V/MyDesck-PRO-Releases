const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const tempFiles = [
  'src/commit_log.txt',
  'scripts/do_final_commit_push.cjs',
  'scripts/commit_removed_synthetic_pass.cjs',
  'powershell.bat'
];

for (const relPath of tempFiles) {
  const fullPath = path.join(root, relPath);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {}
  }
}
console.log('Cleaned scratch debug files.');
