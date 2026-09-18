/**
 * Fail-closed negative controls for production execution authorization.
 *
 * The valid configuration must reach AUTHORIZED_TO_EXECUTE, and every single deviation from it must
 * refuse. Each case starts from the valid manifest and breaks exactly one thing, so a pass proves
 * that condition is load-bearing rather than incidentally satisfied by another check.
 *
 * Nothing here writes to production: authorize() only reads files and git metadata, and stops before
 * any mutation by construction.
 *
 *   node --test migration/firestore/tests/production-execution-authorization.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorize, manifestIntegrityHash, STAGES, assertStorageCopyForbidden }
  from '../lib/production-execution-authorization.mjs';
import { PRODUCTION_ACK } from '../lib/production-guard.mjs';

const CONFIG = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const READINESS = JSON.parse(readFileSync('migration/reports/firestore-production-dry-run.json', 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'authz-'));

const validManifest = () => {
  const body = {
    stage: STAGES.firestoreBulkCopy,
    decision: 'GO',
    firebaseProject: 'mydesckpro',
    firestoreDatabaseId: 'default',
    supabaseProject: 'pubugnfaqqukelvgckdr',
    approvedPreparationCommit: CONFIG.approvedPreparationCommit,
    issuedBy: 'operator',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  return { ...body, integrityHash: manifestIntegrityHash(body) };
};

/** Writes a manifest and returns its path. `mutate` breaks exactly one field. */
function manifestFile(name, mutate = (m) => m) {
  const manifest = mutate(validManifest());
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  return path;
}
/** Re-seals a mutated manifest so the integrity hash is not what fails the case. */
const resealed = (mutate) => (manifest) => {
  const next = mutate(manifest);
  delete next.integrityHash;
  return { ...next, integrityHash: manifestIntegrityHash(next) };
};

const base = { mode: 'production-copy', stage: STAGES.firestoreBulkCopy,
  acknowledgement: PRODUCTION_ACK, config: CONFIG, readiness: READINESS };

test('the valid configuration is authorized', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid') });
  assert.deepEqual(result.reasons, [], `unexpected refusal: ${result.reasons.join(',')}`);
  assert.equal(result.authorized, true);
});

const refuses = (label, overrides, expectedReason) => test(`refuses: ${label}`, () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid'), ...overrides });
  assert.equal(result.authorized, false, `${label} was authorized but must refuse`);
  assert.ok(result.reasons.some((r) => r.startsWith(expectedReason)),
    `${label}: expected ${expectedReason}, got ${result.reasons.join(',')}`);
});

refuses('no acknowledgement', { acknowledgement: null }, 'PRODUCTION_ACKNOWLEDGEMENT_REQUIRED');
refuses('wrong acknowledgement string', { acknowledgement: 'I_ACKNOWLEDGE' }, 'PRODUCTION_ACKNOWLEDGEMENT_REQUIRED');
refuses('missing GO manifest', { goManifestPath: null }, 'SIGNED_GO_MANIFEST_REQUIRED');
refuses('GO manifest path does not exist', { goManifestPath: join(dir, 'absent.json') }, 'GO_MANIFEST_NOT_FOUND');
refuses('mode is not a writing mode', { mode: 'dry-run' }, 'MODE_NOT_A_WRITING_MODE');

test('refuses: malformed GO manifest', () => {
  const path = join(dir, 'malformed.json');
  writeFileSync(path, '{ this is not json');
  const result = authorize({ ...base, goManifestPath: path });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.includes('GO_MANIFEST_MALFORMED'), result.reasons.join(','));
});

test('refuses: manifest is a JSON array, not an object', () => {
  const path = join(dir, 'array.json');
  writeFileSync(path, '[]');
  const result = authorize({ ...base, goManifestPath: path });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.includes('GO_MANIFEST_MALFORMED'), result.reasons.join(','));
});

const refusesManifest = (label, mutate, expectedReason) => test(`refuses: ${label}`, () => {
  const result = authorize({ ...base, goManifestPath: manifestFile(label.replace(/\W+/g, '-'), mutate) });
  assert.equal(result.authorized, false, `${label} was authorized but must refuse`);
  assert.ok(result.reasons.some((r) => r.startsWith(expectedReason)),
    `${label}: expected ${expectedReason}, got ${result.reasons.join(',')}`);
});

// Tamper with a field WITHOUT resealing: the integrity hash must catch it.
refusesManifest('tampered manifest body', (m) => ({ ...m, decision: 'GO', firebaseProject: 'someone-elses-project' }),
  'GO_MANIFEST_INTEGRITY_HASH_MISMATCH');
refusesManifest('absent integrity hash', (m) => { const n = { ...m }; delete n.integrityHash; return n; },
  'GO_MANIFEST_INTEGRITY_HASH_MISMATCH');

// Re-sealed mutations: the integrity hash is valid, so the named condition is what refuses.
refusesManifest('decision is not GO', resealed((m) => ({ ...m, decision: 'NO_GO' })), 'GO_MANIFEST_DECISION_NOT_GO');
refusesManifest('decision absent', resealed((m) => { const n = { ...m }; delete n.decision; return n; }),
  'GO_MANIFEST_DECISION_NOT_GO');
refusesManifest('wrong Firebase project', resealed((m) => ({ ...m, firebaseProject: 'not-mydesckpro' })),
  'GO_MANIFEST_FIREBASEPROJECT_MISMATCH');
refusesManifest('wrong Firestore database id', resealed((m) => ({ ...m, firestoreDatabaseId: '(default)' })),
  'GO_MANIFEST_FIRESTOREDATABASEID_MISMATCH');
refusesManifest('wrong source project', resealed((m) => ({ ...m, supabaseProject: 'some-other-supabase' })),
  'GO_MANIFEST_SUPABASEPROJECT_MISMATCH');
refusesManifest('wrong approved commit', resealed((m) => ({ ...m, approvedPreparationCommit: 'a'.repeat(40) })),
  'GO_MANIFEST_COMMIT_MISMATCH');
refusesManifest('expired manifest', resealed((m) => ({ ...m,
  issuedAt: new Date(Date.now() - 7_200_000).toISOString(), expiresAt: new Date(Date.now() - 3_600_000).toISOString() })),
  'GO_MANIFEST_EXPIRED');
refusesManifest('issued in the future', resealed((m) => ({ ...m,
  issuedAt: new Date(Date.now() + 3_600_000).toISOString() })), 'GO_MANIFEST_ISSUED_IN_FUTURE');
refusesManifest('no issuer', resealed((m) => { const n = { ...m }; delete n.issuedBy; return n; }),
  'GO_MANIFEST_ISSUER_ABSENT');
refusesManifest('stage is the Auth import, not the bulk copy',
  resealed((m) => ({ ...m, stage: STAGES.authImport })), 'GO_MANIFEST_STAGE_MISMATCH');

test('refuses: a bulk-copy manifest cannot authorize the Auth import stage', () => {
  const result = authorize({ ...base, stage: STAGES.authImport, goManifestPath: manifestFile('valid') });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some((r) => r.startsWith('GO_MANIFEST_STAGE_MISMATCH')), result.reasons.join(','));
});

test('refuses: approved commit not pinned', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid'),
    config: { ...CONFIG, approvedPreparationCommit: 'PENDING_POST_REVIEW_PIN' } });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some((r) => r.startsWith('APPROVED_PREPARATION_COMMIT_NOT_PINNED')), result.reasons.join(','));
});

test('refuses: approved commit is a well-formed SHA that does not exist', () => {
  const ghost = 'b'.repeat(40);
  const result = authorize({ ...base, config: { ...CONFIG, approvedPreparationCommit: ghost },
    goManifestPath: manifestFile('ghost', resealed((m) => ({ ...m, approvedPreparationCommit: ghost }))) });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.includes('APPROVED_PREPARATION_COMMIT_UNKNOWN'), result.reasons.join(','));
});

test('refuses: a real commit that is not in HEAD history', () => {
  // git commit-tree with no parent produces a genuine commit object that is reachable from nothing,
  // so it exercises the ancestor check rather than the "does this SHA resolve" check above.
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  const orphan = execFileSync('git', ['commit-tree', tree, '-m', 'orphan-not-in-head-history'],
    { encoding: 'utf8' }).trim();
  const result = authorize({ ...base, config: { ...CONFIG, approvedPreparationCommit: orphan },
    goManifestPath: manifestFile('orphan', resealed((m) => ({ ...m, approvedPreparationCommit: orphan }))) });
  assert.equal(result.authorized, false);
  assert.equal(result.checks.pinnedCommitInHeadHistory, false);
  assert.ok(result.reasons.includes('APPROVED_PREPARATION_COMMIT_NOT_IN_HEAD_HISTORY'), result.reasons.join(','));
});

test('the pinned commit really is in HEAD history', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid') });
  assert.equal(result.checks.pinnedCommitInHeadHistory, true, 'ancestor check must run and pass');
});

test('refuses: wrong config identity', () => {
  for (const [field, bad] of [['firebaseProject', 'nope'], ['firestoreDatabaseId', '(default)'],
    ['supabaseProject', 'nope'], ['schemaVersion', 99], ['transformVersion', '0.0.0']]) {
    const result = authorize({ ...base, goManifestPath: manifestFile('valid'),
      config: { ...CONFIG, [field]: bad } });
    assert.equal(result.authorized, false, `config ${field} was authorized but must refuse`);
  }
});

test('refuses: DRY_RUN_GO is not GO', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid'),
    readiness: { ...READINESS, decision: 'NO_GO' } });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some((r) => r.startsWith('DRY_RUN_NOT_GO')), result.reasons.join(','));
});

test('refuses: readiness blockers present', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid'),
    readiness: { ...READINESS, knownBlockers: ['secret'] } });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some((r) => r.startsWith('DRY_RUN_BLOCKERS_PRESENT')), result.reasons.join(','));
});

test('refuses: readiness evidence absent entirely', () => {
  const result = authorize({ ...base, goManifestPath: manifestFile('valid'), readiness: null });
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some((r) => r.startsWith('DRY_RUN_NOT_GO')), result.reasons.join(','));
});

test('refuses: production Storage copy, permanently and with no authorization path', () => {
  for (const mode of ['production-copy', 'final-delta']) {
    assert.throws(() => assertStorageCopyForbidden(mode),
      /STORAGE_PRODUCTION_COPY_PERMANENTLY_FORBIDDEN_SUPABASE_STORAGE_RETAINED/,
      `storage ${mode} must be refused`);
  }
  // manifest-only is the retained, permitted mode.
  assert.doesNotThrow(() => assertStorageCopyForbidden('manifest-only'));
});

test('the authorization surface reads no ambient input', () => {
  // Scanning for the literal string "--force" would match this module's own documentation, which
  // says it honours no such flag. What matters is that authorize() cannot be influenced by anything
  // outside its arguments: no process.argv, no process.env, anywhere in the module.
  const source = readFileSync('migration/firestore/lib/production-execution-authorization.mjs', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!code.includes('process.argv'), 'authorization must not read process.argv');
  assert.ok(!code.includes('process.env'), 'authorization must not read process.env');
});
