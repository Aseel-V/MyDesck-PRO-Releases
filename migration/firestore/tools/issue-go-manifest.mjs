#!/usr/bin/env node
/**
 * Issue a GO manifest for one production execution stage.
 *
 * The manifest is the operator's written authorization for a single stage, valid for a bounded
 * window. It is deliberately NOT committed to the repository: a long-lived GO manifest sitting in
 * git would be a standing authorization, which is the opposite of the intent. Write it outside the
 * repository, use it, let it expire.
 *
 * Issuing a manifest authorizes nothing by itself. Every other condition in
 * production-execution-authorization.mjs still has to hold, and the identity fields are taken from
 * the frozen EXPECTED identity and the pinned config rather than from arguments, so this tool cannot
 * mint a manifest for a different project, database or commit.
 *
 *   node migration/firestore/tools/issue-go-manifest.mjs \
 *     --stage=firestore-bulk-copy --issued-by="<operator>" --valid-minutes=120 --out=<path>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EXPECTED } from '../lib/production-guard.mjs';
import { STAGES, manifestIntegrityHash } from '../lib/production-execution-authorization.mjs';

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;

const stage = arg('--stage');
const issuedBy = arg('--issued-by');
const validMinutes = Number(arg('--valid-minutes', '120'));
const out = arg('--out');

const allowedStages = Object.values(STAGES);
if (!allowedStages.includes(stage)) throw Error(`STAGE_REQUIRED_ONE_OF:${allowedStages.join('|')}`);
if (!issuedBy) throw Error('ISSUED_BY_REQUIRED');
if (!out) throw Error('OUT_PATH_REQUIRED');
if (!Number.isFinite(validMinutes) || validMinutes <= 0 || validMinutes > 24 * 60) {
  throw Error('VALID_MINUTES_MUST_BE_BETWEEN_1_AND_1440');
}

const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
if (!/^[0-9a-f]{40}$/i.test(config.approvedPreparationCommit ?? '')) {
  throw Error('APPROVED_PREPARATION_COMMIT_NOT_PINNED');
}

const now = Date.now();
const body = {
  stage,
  decision: 'GO',
  // Identity is copied from the frozen expectation, never from an argument.
  firebaseProject: EXPECTED.firebaseProject,
  firestoreDatabaseId: EXPECTED.firestoreDatabaseId,
  supabaseProject: EXPECTED.supabaseProject,
  approvedPreparationCommit: config.approvedPreparationCommit,
  issuedBy,
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + validMinutes * 60_000).toISOString(),
};
const manifest = { ...body, integrityHash: manifestIntegrityHash(body) };
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ issued: out, stage, expiresAt: manifest.expiresAt,
  approvedPreparationCommit: manifest.approvedPreparationCommit,
  note: 'authorizes nothing on its own; every other authorization condition still applies' }, null, 2));
