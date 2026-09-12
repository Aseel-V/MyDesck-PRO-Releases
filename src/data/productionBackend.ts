export type ProductionWriteResult<T> = { ok: true; value: T } | { ok: false; error: Error };

/** A Firestore production failure is returned to the caller. Supabase is never attempted. */
export async function firestoreOnlyWrite<T>(write: () => Promise<T>): Promise<ProductionWriteResult<T>> {
  try { return { ok: true, value: await write() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error : new Error('FIRESTORE_WRITE_FAILED') }; }
}

export function assertProductionFirestoreIdentity(projectId: string, databaseId: string): void {
  if (projectId !== 'mydesckpro') throw Error('WRONG_FIREBASE_PROJECT');
  if (databaseId !== 'default') throw Error('WRONG_FIRESTORE_DATABASE');
}
