export type SearchMode = 'exact' | 'prefix' | 'substring';
export type SearchEntity = 'trips' | 'deletedTrips' | 'tripTemplates' | 'users' | 'restaurantGuests'
  | 'reservations' | 'menuItems' | 'orders' | 'marketProducts' | 'vehicles' | 'parts' | 'repairInventory';

export interface SearchRequest {
  entity: SearchEntity;
  tenantId: string;
  text: string;
  mode: SearchMode;
  allTokens?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SearchCandidate {
  id: string;
  tenantId: string;
  fields: readonly string[];
  orderKey: string;
}

export interface SearchHit { id: string; orderKey: string }
export interface SearchPage { items: SearchHit[]; next?: string }
export interface SearchRepository { search(request: SearchRequest): Promise<SearchPage> }

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
}

export function candidateMatches(candidate: SearchCandidate, request: SearchRequest): boolean {
  if (candidate.tenantId !== request.tenantId) return false;
  const term = normalizeSearchText(request.text);
  if (!term) return false;
  if (request.mode === 'substring' && request.allTokens) {
    const haystack = candidate.fields.map(normalizeSearchText).join(' ');
    return term.split(' ').every((token) => haystack.includes(token));
  }
  return candidate.fields.some((field) => {
    const normalized = normalizeSearchText(field);
    if (request.mode === 'exact') return normalized === term;
    if (request.mode === 'prefix') return normalized.startsWith(term);
    return normalized.includes(term);
  });
}

export function searchCandidates(candidates: readonly SearchCandidate[], request: SearchRequest): SearchPage {
  const size = request.limit ?? 20;
  if (!request.tenantId || !Number.isInteger(size) || size < 1 || size > 50) throw Error('INVALID_SEARCH_SCOPE');
  const ordered = candidates.filter((item) => candidateMatches(item, request))
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id));
  const start = request.cursor ? ordered.findIndex((item) => `${item.orderKey}\u0000${item.id}` === request.cursor) + 1 : 0;
  if (request.cursor && start === 0) throw Error('INVALID_SEARCH_CURSOR');
  const page = ordered.slice(start, start + size);
  const last = page.length ? page[page.length - 1] : undefined;
  return { items: page.map(({ id, orderKey }) => ({ id, orderKey })),
    ...(start + size < ordered.length && last ? { next: `${last.orderKey}\u0000${last.id}` } : {}) };
}

/** Only for a server-proven complete and bounded tenant set. */
export class BoundedClientSearchRepository implements SearchRepository {
  constructor(private readonly load: (request: SearchRequest) => Promise<{ complete: boolean; items: SearchCandidate[] }>,
    private readonly maximum = 500) {}
  async search(request: SearchRequest): Promise<SearchPage> {
    const loaded = await this.load(request);
    if (!loaded.complete || loaded.items.length > this.maximum) throw Error('UNBOUNDED_CLIENT_SEARCH_REFUSED');
    return searchCandidates(loaded.items, request);
  }
}

/** Provider-neutral boundary for substring/fuzzy parity that Firestore cannot supply. */
export class ExternalSearchRepository implements SearchRepository {
  constructor(private readonly transport: (request: SearchRequest) => Promise<SearchPage>) {}
  async search(request: SearchRequest): Promise<SearchPage> {
    const size = request.limit ?? 20;
    if (!request.tenantId || !normalizeSearchText(request.text)
      || !Number.isInteger(size) || size < 1 || size > 50) throw Error('INVALID_SEARCH_SCOPE');
    return this.transport({ ...request, limit: size, text: normalizeSearchText(request.text) });
  }
}

/** Indexed exact/prefix provider. Substring requests must use ExternalSearchRepository. */
export class FirestoreNativeSearchRepository implements SearchRepository {
  constructor(private readonly indexedQuery: (request: SearchRequest) => Promise<SearchPage>) {}
  async search(request: SearchRequest): Promise<SearchPage> {
    if (request.mode === 'substring') throw Error('EXTERNAL_SEARCH_INDEX_REQUIRED');
    if (!request.tenantId || !normalizeSearchText(request.text)) throw Error('INVALID_SEARCH_SCOPE');
    return this.indexedQuery({ ...request, text: normalizeSearchText(request.text), limit: Math.min(request.limit ?? 20, 50) });
  }
}
