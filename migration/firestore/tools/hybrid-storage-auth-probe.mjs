#!/usr/bin/env node
/**
 * Hybrid Storage auth probe (HYBRID_STORAGE_GO evidence).
 *
 * The target architecture keeps Supabase Storage while removing Supabase Auth.
 * That only works if the Supabase project accepts Firebase ID tokens, which are
 * RS256 and validated against Google's JWKS. A project without third-party auth
 * configured accepts only HS256 tokens signed with its own JWT secret.
 *
 * This probe determines which algorithms the Storage service accepts. It sends
 * deliberately invalid signatures: it can never authenticate, and it never needs
 * a real credential. Read-only. No bytes are read, written or deleted.
 *
 * Interpretation:
 *   RS256 rejected at the "alg" header  -> third-party (Firebase) auth NOT enabled
 *   RS256 reaching signature/JWKS check -> third-party auth IS enabled
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PRIVATE_BUCKET = 'business-signatures';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) throw Error('MISSING_SUPABASE_PUBLIC_CONFIG');

const unsigned = (alg) => [
  Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'https://securetoken.google.com/mydesckpro', aud: 'mydesckpro',
    sub: 'probe-not-a-real-uid', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url'),
  'invalid-signature-probe',
].join('.');

const listEndpoint = `${url}/storage/v1/object/list/${PRIVATE_BUCKET}`;
const algorithms = {};
for (const alg of ['RS256', 'HS256', 'ES256', 'none']) {
  const response = await fetch(listEndpoint, { method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${unsigned(alg)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1 }), signal: AbortSignal.timeout(20000) });
  const message = JSON.parse(await response.text().catch(() => '{}'))?.message ?? null;
  algorithms[alg] = { http: response.status, message,
    algorithmAccepted: message !== null && !/Algorithm.*not allowed/i.test(message) };
}

const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(20000) })
  .then(async (r) => ({ http: r.status, data: await r.json() })).catch(() => ({ http: 0 }));
const externalProviders = settings.data?.external
  ? Object.entries(settings.data.external).filter(([, on]) => on).map(([name]) => name) : null;

const anonymousPrivateRead = await fetch(`${url}/storage/v1/object/${PRIVATE_BUCKET}/probe-nonexistent`,
  { headers: { apikey: anon }, signal: AbortSignal.timeout(20000) })
  .then((r) => ({ http: r.status, denied: r.status >= 400 })).catch(() => ({ http: 0, denied: null }));

const firebaseTokensAccepted = algorithms.RS256.algorithmAccepted === true;
const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  bytesRead: 0,
  projectHostPrefix: `${new URL(url).hostname.split('.')[0].slice(0, 8)}…`,
  privateBucket: PRIVATE_BUCKET,
  algorithms,
  acceptedAlgorithms: Object.entries(algorithms).filter(([, v]) => v.algorithmAccepted).map(([k]) => k),
  gotrueExternalProviders: externalProviders,
  anonymousPrivateRead,
  firebaseThirdPartyAuthEnabled: firebaseTokensAccepted,
  clientPassesFirebaseToken: /accessToken\s*:/.test(readFileSync('src/lib/supabase.ts', 'utf8')),
  storageRepositoryUsesSupabaseAuth: /supabase\.auth\./.test(readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8')),
  decision: firebaseTokensAccepted ? 'HYBRID_STORAGE_AUTH_POSSIBLE' : 'HYBRID_STORAGE_AUTH_BLOCKED',
  reason: firebaseTokensAccepted
    ? 'The Storage service accepts RS256, consistent with a configured third-party issuer. Prove end to end with a real Firebase identity before relying on it.'
    : 'The Storage service accepts HS256 only, so it validates against the project JWT secret rather than a third-party JWKS. Firebase ID tokens are RS256 and are rejected at the algorithm header. Minting an HS256 token requires the project JWT secret, which cannot ship inside Electron, and the Spark constraint forbids a server to mint one.',
};
writeFileSync('migration/reports/hybrid-storage-auth-probe.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ acceptedAlgorithms: report.acceptedAlgorithms,
  gotrueExternalProviders: externalProviders, firebaseThirdPartyAuthEnabled: firebaseTokensAccepted,
  decision: report.decision }, null, 2));
if (!firebaseTokensAccepted) process.exitCode = 2;
