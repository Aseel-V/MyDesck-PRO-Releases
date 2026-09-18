/**
 * The identity every production Firestore connection in this migration uses.
 *
 * Not the operator, and not the ambient ADC identity. ADC on this machine impersonates
 * mydesck-migration@, which has no Firestore access, and cannot itself impersonate the migration
 * identity; the operator's own gcloud account is the one holding tokenCreator on it. So the token is
 * minted the way every other tool in this repository mints it — `gcloud auth print-access-token
 * --impersonate-service-account=<identity>` — and handed to the Firestore client.
 *
 * There is deliberately no fallback. If the token cannot be minted the connection is refused rather
 * than quietly opened as whatever identity happens to be lying around: acting on production as the
 * wrong principal is worse than not starting.
 *
 * This lives in one place because it was starting to live in three. A connection helper that is
 * copied per caller is a connection helper that will eventually differ per caller, and the one
 * property that must never differ is which principal the writes are attributed to.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const MIGRATION_WRITE_IDENTITY =
  'mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com';

export class MigrationIdentityError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MigrationIdentityError';
    this.code = code;
  }
}

/**
 * Open a Firestore client authenticated as the migration identity.
 *
 * @returns {Promise<{db: object, close: () => Promise<void>, identity: string}>}
 */
export async function openMigrationFirestore({ projectId, databaseId }) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new MigrationIdentityError('EMULATOR_HOST_SET_FOR_PRODUCTION_CONNECTION');
  }
  const { AuthClient, GoogleAuth } = await import('google-auth-library');
  const { Firestore } = await import('@google-cloud/firestore');

  /** Mints and caches the identity's access token. The token is never logged or persisted. */
  class MigrationIdentityClient extends AuthClient {
    #token = null;
    #expiresAt = 0;

    async getAccessToken() {
      if (this.#token && Date.now() < this.#expiresAt) return { token: this.#token };
      const sdk = process.env.GCLOUD_SDK_ROOT
        ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
      let minted;
      try {
        minted = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
          [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token',
            `--impersonate-service-account=${MIGRATION_WRITE_IDENTITY}`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
      } catch {
        // The failure detail can carry account names; the code is enough to act on.
        throw new MigrationIdentityError('MIGRATION_IDENTITY_TOKEN_UNAVAILABLE', MIGRATION_WRITE_IDENTITY);
      }
      if (!minted) throw new MigrationIdentityError('MIGRATION_IDENTITY_TOKEN_EMPTY', MIGRATION_WRITE_IDENTITY);
      this.#token = minted;
      // gcloud mints these for about an hour; refresh well inside that.
      this.#expiresAt = Date.now() + 30 * 60 * 1000;
      return { token: this.#token };
    }

    async getRequestHeaders() {
      const { token } = await this.getAccessToken();
      return new Headers({ authorization: `Bearer ${token}` });
    }

    async request(options) { return this.transporter.request(options); }
  }

  // Proves the identity is actually available before any document is touched.
  const client = new MigrationIdentityClient();
  await client.getAccessToken();

  const db = new Firestore({
    projectId,
    databaseId,
    auth: new GoogleAuth({ authClient: client }),
    ignoreUndefinedProperties: false,
  });
  return { db, close: () => db.terminate(), identity: MIGRATION_WRITE_IDENTITY };
}
