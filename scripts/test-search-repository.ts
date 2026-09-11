import assert from 'node:assert/strict';
import { BoundedClientSearchRepository, ExternalSearchRepository, FirestoreNativeSearchRepository,
  candidateMatches, searchCandidates, type SearchCandidate, type SearchRequest } from '../src/data/SearchRepository';

const corpus: SearchCandidate[] = [
  { id: 'a1', tenantId: 'A', fields: ['رحلة القدس', 'ليان'], orderKey: '2026-01-01' },
  { id: 'a2', tenantId: 'A', fields: ['ירושלים וים', 'נועה'], orderKey: '2026-01-01' },
  { id: 'a3', tenantId: 'A', fields: ['Paris MIX رحلة', 'ALICE'], orderKey: '2026-02-01' },
  { id: 'a4', tenantId: 'A', fields: ['Paris Center', 'Alice Brown'], orderKey: '2026-03-01' },
  { id: 'b1', tenantId: 'B', fields: ['رحلة القدس', 'ALICE'], orderKey: '2026-01-01' },
];
const request = (text: string, mode: SearchRequest['mode'] = 'substring', extra = {}): SearchRequest =>
  ({ entity: 'trips', tenantId: 'A', text, mode, limit: 2, allTokens: true, ...extra });

const external = new ExternalSearchRepository(async (input) => searchCandidates(corpus, input));
assert.deepEqual((await external.search(request('القدس'))).items.map((x) => x.id), ['a1'], 'Arabic substring parity');
assert.deepEqual((await external.search(request('ירוש'))).items.map((x) => x.id), ['a2'], 'Hebrew substring parity');
assert.deepEqual((await external.search(request('PARIS'))).items.map((x) => x.id), ['a3', 'a4'], 'English case-insensitive parity');
assert.deepEqual((await external.search(request('mix رحلة'))).items.map((x) => x.id), ['a3'], 'mixed RTL/LTR parity');
assert.deepEqual((await external.search(request('Alice Paris'))).items.map((x) => x.id), ['a3', 'a4'], 'AND-token parity');
assert.deepEqual((await external.search(request('missing'))).items, [], 'no-result parity');
assert.equal(candidateMatches(corpus[0], request('رحلة القدس', 'exact')), true, 'exact match');
assert.equal(candidateMatches(corpus[0], request('رحلة', 'prefix')), true, 'prefix match');
assert.equal((await external.search(request('alice'))).items.some((x) => x.id === 'b1'), false, 'tenant isolation');
const first = await external.search(request('a', 'substring', { limit: 1 }));
const second = await external.search(request('a', 'substring', { limit: 1, cursor: first.next }));
assert.notEqual(first.items[0].id, second.items[0].id, 'cursor pagination');
assert.equal(first.items[0].id, 'a3', 'stable order uses orderKey then id');
const bounded = new BoundedClientSearchRepository(async () => ({ complete: true, items: corpus.filter((x) => x.tenantId === 'A') }), 10);
assert.deepEqual((await bounded.search(request('alice'))).items.map((x) => x.id), ['a3', 'a4'], 'bounded client search');
const incomplete = new BoundedClientSearchRepository(async () => ({ complete: false, items: corpus }));
await assert.rejects(() => incomplete.search(request('alice')), /UNBOUNDED_CLIENT_SEARCH_REFUSED/);
const firestore = new FirestoreNativeSearchRepository(async (input) => searchCandidates(corpus, input));
assert.deepEqual((await firestore.search(request('رحلة', 'prefix'))).items.map((x) => x.id), ['a1']);
await assert.rejects(() => firestore.search(request('رحلة', 'substring')), /EXTERNAL_SEARCH_INDEX_REQUIRED/);
await assert.rejects(() => external.search({ ...request('a'), tenantId: '' }), /INVALID_SEARCH_SCOPE/);
console.log('SearchRepository parity and safety: PASS (16 assertions)');
