const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

// Prepend System32 to path on Windows to avoid spawn ENOENT when calling shells
if (process.platform === 'win32') {
  const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === 'path') || 'PATH';
  const system32 = 'C:\\Windows\\System32';
  const currentPath = process.env[pathKey] || '';
  const paths = currentPath.split(path.delimiter);
  if (!paths.some(p => p.toLowerCase() === system32.toLowerCase())) {
    process.env[pathKey] = `${system32}${path.delimiter}${currentPath}`;
  }
}

// 1. Clean up stale ports
try {
  require('./stop-dev.cjs');
} catch (e) {
  console.warn('[Dev] Pre-cleanup warning:', e.message);
}

// 2. Start Dev Server
console.log('[Dev] Starting Vite development server...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const devProcess = spawn(npmCmd, ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

devProcess.on('error', (err) => {
  console.error('[Dev] Failed to start Vite server:', err);
  process.exit(1);
});

// 3. Poll Vite server
let electronProcess = null;
let isElectronStarted = false;

function poll() {
  if (isElectronStarted) return;

  const req = http.get('http://127.0.0.1:5173', (res) => {
    // If port is listening, start Electron
    isElectronStarted = true;
    startElectron();
  });

  req.on('error', () => {
    // Keep polling every 200ms
    setTimeout(poll, 200);
  });
}

// Start polling
setTimeout(poll, 800);

function startElectron() {
  console.log('[Dev] Vite port 5173 is ready. Launching Electron app...');
  electronProcess = spawn('node', [path.join(__dirname, 'launch-electron.cjs'), 'development'], {
    stdio: 'inherit',
    env: process.env,
  });

  electronProcess.on('exit', (code) => {
    console.log('[Dev] Electron app exited.');
    devProcess.kill();
    process.exit(code ?? 0);
  });
}

// Cleanup processes on interrupt
process.on('SIGINT', () => {
  console.log('\n[Dev] Interrupted. Cleaning up...');
  if (electronProcess) {
    try { electronProcess.kill(); } catch {}
  }
  try { devProcess.kill(); } catch {}
  process.exit(0);
});
