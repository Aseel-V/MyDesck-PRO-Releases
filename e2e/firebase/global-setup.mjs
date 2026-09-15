import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const PROJECT = 'mydesck-migration-proof';
export const SMOKE_PORT = Number(process.env.MYDESCK_SMOKE_PORT ?? 5180);
const SERVER_START_TIMEOUT_MS = 240_000;

const responds = (url) => fetch(url).then(() => true, () => false);

/**
 * The Firebase-root dev server, started without a shell so the process this run ends is the server itself.
 * Playwright's webServer starts its command through cmd.exe on Windows and its teardown left the server
 * running, which kept the run from finishing. A server already listening on the port is never reused: it
 * could be serving the shipped Supabase root.
 */
async function startDevServer(root) {
  const url = `http://127.0.0.1:${SMOKE_PORT}/`;
  if (await responds(url)) throw new Error(`UI_SMOKE_PORT_IN_USE:${SMOKE_PORT}`);
  const server = spawn(process.execPath, ['scripts/dev-firebase-emulator.mjs'], {
    cwd: root, env: { ...process.env, MYDESCK_SMOKE_PORT: String(SMOKE_PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (chunk) => { log += chunk; });
  server.stderr.on('data', (chunk) => { log += chunk; });
  const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
  const stop = async () => {
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await Promise.race([exited, delay(15_000)]);
  };
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (!(await responds(url))) {
    if (server.exitCode !== null) throw new Error(`UI_SMOKE_DEV_SERVER_EXITED:${server.exitCode}\n${log}`);
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`UI_SMOKE_DEV_SERVER_TIMEOUT\n${log}`);
    }
    await delay(500);
  }
  return stop;
}

/**
 * Loads the committed Rules into the emulator, so a smoke never runs against Rules another suite left behind,
 * creates the synthetic tenants through the application's registration path (see fixtures.mjs), and starts
 * the dev server. The returned function stops the server when the run ends.
 */
export default async function globalSetup() {
  const root = resolve(import.meta.dirname, '../..');
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  const loaded = await fetch(`http://${host}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(resolve(root, 'migration/firestore/rules/firestore.rules'), 'utf8') }] } }),
  });
  if (!loaded.ok) throw new Error(`UI_SMOKE_RULES_LOAD_FAILED:${loaded.status}:${await loaded.text()}`);
  for (const step of ['--cleanup', '--create']) {
    const run = spawnSync(process.execPath, ['scripts/run-typescript-source-test.mjs', 'e2e/firebase/fixtures.mjs', step],
      { cwd: root, encoding: 'utf8', env: process.env });
    if (run.status !== 0) throw new Error(`UI_SMOKE_FIXTURE_${step.slice(2).toUpperCase()}_FAILED\n${run.stdout}\n${run.stderr}`);
  }
  return startDevServer(root);
}
