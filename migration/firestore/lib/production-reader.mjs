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
import { MIGRATION_WRITE_IDENTITY, openMigrationFirestore } from './migration-identity.mjs';

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
    try {
      return await openMigrationFirestore({ projectId, databaseId });
    } catch (error) {
      throw new ProductionReaderError(error?.code ?? 'PRODUCTION_CONNECTION_FAILED',
        MIGRATION_WRITE_IDENTITY);
    }
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

    /**
     * Every document beneath the given document paths, found by listing their subcollections.
     *
     * The narrow alternative to a collection-group scan. A scan reads the whole corpus to find a
     * handful of documents, which is what exhausted the daily allowance; this asks only about the
     * documents we already know we own, and returns ids rather than contents.
     */
    async listDescendantPaths(documentPaths) {
      const found = [];
      const perParent = [];
      for (const path of documentPaths) {
        const collections = await db.doc(path).listCollections();
        const children = [];
        for (const child of collections) {
          const refs = await child.listDocuments();
          for (const ref of refs) { found.push(ref.path); children.push(ref.path); }
        }
        perParent.push({ parent: path, subcollections: collections.map((c) => c.id),
          documents: children.length });
      }
      return { paths: found, perParent };
    },

    async close() { if (connection.close) await connection.close(); },
  });
}
