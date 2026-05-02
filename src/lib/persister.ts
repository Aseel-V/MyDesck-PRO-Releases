import { get, set, del } from 'idb-keyval';
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

export const createIDBPersister = (idbValidKey: IDBValidKey = 'reactQuery'): Persister => {
    let disabled = false;
    let hasWarned = false;

    const warnAndDisable = (operation: string, error: unknown) => {
        disabled = true;
        if (!hasWarned) {
            hasWarned = true;
            console.warn(
                `[ReactQuery] IndexedDB persistence ${operation} failed; continuing without persisted query cache.`,
                error
            );
        }
    };

    return {
        persistClient: async (client: PersistedClient) => {
            if (disabled) return;
            try {
                await set(idbValidKey, client);
            } catch (error) {
                warnAndDisable('save', error);
            }
        },
        restoreClient: async () => {
            if (disabled) return undefined;
            try {
                return await get<PersistedClient>(idbValidKey);
            } catch (error) {
                warnAndDisable('restore', error);
                try {
                    await del(idbValidKey);
                } catch {
                    // Ignore cleanup failures; the app can run with network-backed queries.
                }
                return undefined;
            }
        },
        removeClient: async () => {
            try {
                await del(idbValidKey);
            } catch (error) {
                warnAndDisable('remove', error);
            }
        },
    };
};
