/**
 * Durable report writing.
 *
 * This repository lives inside a OneDrive-synced folder. The sync client
 * intermittently holds a handle on a file it is uploading, and a plain
 * writeFileSync then fails with an opaque `UNKNOWN: unknown error, open ...`
 * on Windows. That surfaced as a harness step failing after all 93 migrations
 * had already replayed successfully — a flaky red that looks like a migration
 * regression and is not.
 *
 * Write to a sibling temp file, then rename over the target, retrying briefly.
 * Rename is atomic on the same volume, so a reader never observes a partial
 * report.
 */

import { writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const RETRY_DELAYS_MS = [0, 50, 150, 400, 1000];

function sleepSync(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @param {string} path    destination file
 * @param {string} content full file contents
 * @returns {{attempts:number}}
 */
export function writeReport(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;

  let lastError;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    sleepSync(RETRY_DELAYS_MS[i]);
    try {
      writeFileSync(tmp, content, 'utf8');
      renameSync(tmp, path);
      return { attempts: i + 1 };
    } catch (e) {
      lastError = e;
      try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    }
  }

  throw new Error(
    `could not write ${path} after ${RETRY_DELAYS_MS.length} attempts: ${lastError?.message}. ` +
    `If this persists, the file is held by another process (OneDrive sync is the usual cause here).`
  );
}
