const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const tempFiles = [
  'src/commit_log.txt',
  'scripts/do_commit_harness.cjs',
  'scripts/do_force_commit_push.cjs',
  'powershell.bat'
];

for (const relPath of tempFiles) {
  const fullPath = path.join(root, relPath);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {}
  }
}
console.log('Cleaned scratch debug files.');
