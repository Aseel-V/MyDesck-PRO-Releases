import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';
import { stripSensitiveTravelerDraftFields } from '../lib/tripPrivacy';

const TRIP_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type StoredDraft<T extends object> = {
  savedAt?: number;
  data?: Partial<T>;
};

interface UseTripDraftInput<T extends object> {
  userId?: string;
  enabled: boolean;
  values: Partial<T>;
  onRestore: (draft: Partial<T>) => void;
  onRestored: () => void;
}

export function useTripDraft<T extends object>({
  userId,
  enabled,
  values,
  onRestore,
  onRestored,
}: UseTripDraftInput<T>) {
  const storageKey = useMemo(() => userId ? `new_trip_draft:${userId}` : null, [userId]);
  const debouncedValues = useDebounce(values, 1000);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const restoreRef = useRef(onRestore);
  const restoredRef = useRef(onRestored);
  restoreRef.current = onRestore;
  restoredRef.current = onRestored;

  useEffect(() => {
    localStorage.removeItem('new_trip_draft');
    if (!enabled || !storageKey) return;

    const savedDraft = localStorage.getItem(storageKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as StoredDraft<T> | Partial<T>;
        const wrapped = parsed as StoredDraft<T>;
        const savedAt = typeof wrapped.savedAt === 'number' ? wrapped.savedAt : undefined;
        const rawData = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : parsed;
        const draft = stripSensitiveTravelerDraftFields(rawData) as Partial<T>;

        if (savedAt && Date.now() - savedAt > TRIP_DRAFT_TTL_MS) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify({ savedAt: savedAt ?? Date.now(), data: draft }));
          restoreRef.current(draft);
          restoredRef.current();
        }
      } catch {
        localStorage.removeItem(storageKey);
        console.error('Failed to restore trip draft');
      }
    }
    setHydratedKey(storageKey);
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey || hydratedKey !== storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({
      savedAt: Date.now(),
      data: stripSensitiveTravelerDraftFields(debouncedValues),
    }));
  }, [debouncedValues, enabled, hydratedKey, storageKey]);

  const clearDraft = useCallback(() => {
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { clearDraft, storageKey };
}
