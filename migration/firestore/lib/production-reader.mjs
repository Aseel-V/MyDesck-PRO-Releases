/**
 * Read-only production Firestore access.
 *
 * Reconciliation has to observe the real target, which the authorized production target cannot do
 * on its own: it deliberately exposes only `verifyPlannedDocument`, so it can confirm that planned
 * documents arrived but never that nothing else did. Detecting unexpected documents requires
 * enumeration, and enumeration is the one thing a write boundary should not grow.
 *
 * So observation gets its own module instead. It is the mirror image of the write target: it holds
 * a Firestore instance, it never returns it, and it has no `set`, no `delete`, no `batch` and no
 * transaction — there is no method here that can change anything. That is also why it takes no
 * capability and no GO manifest. Authorization gates mutation; requiring a write authorization in
 * order to look at the result would mean minting write authority every time someone wanted to check
 * whether the copy was correct, which is exactly backwards.
 *
 * It authenticates as the same migration identity the copy wrote as, for the same reason: ambient
 * credentials on this machine resolve to an account with no Firestore access at all.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { MIGRATION_WRITE_IDENTITY } from './authorized-production-target.mjs';

export class ProductionReaderError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProductionReaderError';
    this.code = code;
  }
}

/** Firestore's limit on documents fetched in one `getAll` call. */
export const GET_ALL_LIMIT = 300;

/**
 * Open the reader.
 *
 * `firestoreFactory` exists for tests, exactly as it does on the write side.
 */
export async function openProductionReader({ projectId, databaseId, firestoreFactory } = {}) {
  if (projectId !== 'mydesckpro') throw new ProductionReaderError('READER_PROJECT_MISMATCH', String(projectId));
  if (databaseId !== 'default') throw new ProductionReaderError('READER_DATABASE_MISMATCH', String(databaseId));

  const connect = firestoreFactory ?? (async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new ProductionReaderError('EMULATOR_HOST_SET_FOR_PRODUCTION_READER');
    }
    const { AuthClient, GoogleAuth } = await import('google-auth-library');
    const { Firestore } = await import('@google-cloud/firestore');

    class MigrationReadClient extends AuthClient {
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
          throw new ProductionReaderError('MIGRATION_IDENTITY_TOKEN_UNAVAILABLE', MIGRATION_WRITE_IDENTITY);
        }
        if (!minted) throw new ProductionReaderError('MIGRATION_IDENTITY_TOKEN_EMPTY', MIGRATION_WRITE_IDENTITY);
        this.#token = minted;
        this.#expiresAt = Date.now() + 30 * 60 * 1000;
        return { token: this.#token };
      }

      async getRequestHeaders() {
        const { token } = await this.getAccessToken();
        return new Headers({ authorization: `Bearer ${token}` });
      }

      async request(options) { return this.transporter.request(options); }
    }

    const reader = new MigrationReadClient();
    await reader.getAccessToken();
    const db = new Firestore({
      projectId, databaseId,
      auth: new GoogleAuth({ authClient: reader }),
      ignoreUndefinedProperties: false,
    });
    return { db, close: () => db.terminate() };
  });

  const connection = await connect({ projectId, databaseId });
  const db = connection.db;

  return Object.freeze({
    projectId,
    databaseId,
    identity: MIGRATION_WRITE_IDENTITY,

    /**
     * Fetch documents by exact path, in `getAll` sized pages.
     *
     * @returns Map of path -> document data, absent when the document does not exist
     */
    async readDocuments(paths) {
      if (!Array.isArray(paths)) throw new ProductionReaderError('READ_PATHS_NOT_AN_ARRAY');
      const found = new Map();
      for (let index = 0; index < paths.length; index += GET_ALL_LIMIT) {
        const page = paths.slice(index, index + GET_ALL_LIMIT);
        const snapshots = await db.getAll(...page.map((path) => db.doc(path)));
        for (const snapshot of snapshots) {
          if (snapshot.exists) found.set(snapshot.ref.path, snapshot.data());
        }
      }
      return found;
    },

    /**
     * Every document path present under the given collection ids, at any depth.
     *
     * This is what makes "unexpected documents = 0" a measurement rather than an assumption: the
     * plan says what should be there, and only a scan can say what actually is.
     */
    async scanCollectionGroups(collectionIds) {
      const paths = new Set();
      const perCollection = [];
      for (const collectionId of collectionIds) {
        const snapshot = await db.collectionGroup(collectionId).select().get();
        for (const doc of snapshot.docs) paths.add(doc.ref.path);
        perCollection.push({ collectionId, documents: snapshot.size });
      }
      return { paths, perCollection };
    },

    async close() { if (connection.close) await connection.close(); },
  });
}
