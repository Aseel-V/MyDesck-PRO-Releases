/**
 * A minimal Firestore REST client for exercising Security Rules.
 *
 * The rules are tested over the emulator's REST API with unsigned JWTs rather
 * than through a client SDK. That is deliberate: it adds no dependency to a
 * migration branch, and it exercises the real rules engine over the real wire
 * protocol instead of whatever a client library decides to send.
 *
 * The emulator accepts an unsigned token and reads `request.auth` from its
 * claims. `Authorization: Bearer owner` bypasses rules entirely, which is how
 * the suite seeds fixtures without granting itself the access it is testing.
 */

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An unsigned emulator token for one identity, with optional custom claims. */
export function emulatorToken(uid, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({
    iss: 'https://securetoken.google.com/mydesck-migration-proof',
    aud: 'mydesck-migration-proof',
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    email_verified: true,
    firebase: { identities: {}, sign_in_provider: 'password' },
    ...claims,
  });
  return `${header}.${payload}.`;
}

export const OWNER_TOKEN = 'owner';

export class RulesClient {
  constructor({ host, projectId, databaseId = '(default)', token }) {
    this.base = `http://${host}/v1/projects/${projectId}/databases/${databaseId}/documents`;
    this.token = token;
  }

  static asUser(uid, options, claims) {
    return new RulesClient({ ...options, token: emulatorToken(uid, claims) });
  }

  static asAnonymous(options) {
    return new RulesClient({ ...options, token: null });
  }

  static asAdminBypass(options) {
    return new RulesClient({ ...options, token: OWNER_TOKEN });
  }

  headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  async request(method, path, body, query = '') {
    const response = await fetch(`${this.base}/${path}${query}`, {
      method,
      headers: this.headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ok: response.ok,
      body: await response.json().catch(() => null) };
  }

  get(path) { return this.request('GET', path); }

  /** A create that must fail if the document already exists. */
  create(collection, docId, fields) {
    return this.request('POST', collection,
      { fields: toFirestoreFields(fields) }, `?documentId=${encodeURIComponent(docId)}`);
  }

  /** A targeted update: only the named fields are written. */
  update(path, fields) {
    const mask = Object.keys(fields)
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    return this.request('PATCH', path, { fields: toFirestoreFields(fields) }, `?${mask}`);
  }

  /** A full-document write, which is how a client would replace a document. */
  set(path, fields) {
    return this.request('PATCH', path, { fields: toFirestoreFields(fields) });
  }

  delete(path) { return this.request('DELETE', path); }

  /** A structured query, so list rules are exercised as real queries. */
  async query(collection, where = [], limit = 50) {
    const filters = where.map(([field, op, value]) => ({
      fieldFilter: { field: { fieldPath: field }, op, value: toFirestoreValue(value) },
    }));
    const structuredQuery = {
      from: [{ collectionId: collection }],
      limit,
      ...(filters.length
        ? { where: filters.length === 1 ? filters[0]
          : { compositeFilter: { op: 'AND', filters } } }
        : {}),
    };
    const response = await fetch(`${this.base}:runQuery`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ structuredQuery }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body,
      documents: Array.isArray(body) ? body.filter((r) => r.document).length : 0 };
  }
}

export function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields(value) } };
  throw new Error(`UNSUPPORTED_VALUE: ${typeof value}`);
}

export function toFirestoreFields(object) {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [key, toFirestoreValue(value)]));
}

/** Firestore denies with 403; anything else is a different failure. */
export const isDenied = (result) => result.status === 403;
export const isAllowed = (result) => result.ok;
export const isNotFound = (result) => result.status === 404;
