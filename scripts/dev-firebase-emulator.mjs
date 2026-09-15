#!/usr/bin/env node
/**
 * Vite dev server for the Firebase composition root against the local emulators, for browser smoke tests.
 *
 * The backend-mode guard (src/data/backendMode.ts) accepts the emulator only in a development build served
 * from a loopback host with the emulator project id, so this can never reach a real Firebase project.
 * HMR is off: without it @vitejs/plugin-react injects no inline refresh preamble, and the page runs under
 * the same Content-Security-Policy as the shipped application.
 *
 *   MYDESCK_SMOKE_PORT=5180 node scripts/dev-firebase-emulator.mjs
 */
import { createServer } from 'vite';

process.env.VITE_DATA_BACKEND = 'firestore-emulator';
process.env.VITE_FIREBASE_PROJECT_ID = 'mydesck-migration-proof';
const port = Number(process.env.MYDESCK_SMOKE_PORT ?? 5180);

const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await server.listen();
server.printUrls();

// The smoke's global setup starts this process directly and ends it when the run finishes. If the runner is
// killed instead, nothing ends it on Windows and it would hold the port, so exit once the parent is gone.
const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    void server.close().finally(() => process.exit(0));
  }
}, 1000).unref();
