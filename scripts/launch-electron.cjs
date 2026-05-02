const { spawn } = require('node:child_process');
const path = require('node:path');

const mode = process.argv[2] || 'production';
const electronExe = process.platform === 'win32'
  ? path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(__dirname, '..', 'node_modules', '.bin', 'electron');

const env = {
  ...process.env,
  NODE_ENV: mode,
};

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, ['.'], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
