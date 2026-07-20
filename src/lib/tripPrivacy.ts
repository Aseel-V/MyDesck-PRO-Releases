export function stripSensitiveTravelerDraftFields<T extends object>(
  data: T
): Omit<T, 'travelers' | 'client_phone' | 'attachments'> {
  const safeDraft = { ...data } as T & {
    travelers?: unknown;
    client_phone?: unknown;
    attachments?: unknown;
  };
  delete safeDraft.travelers;
  delete safeDraft.client_phone;
  delete safeDraft.attachments;
  return safeDraft;
}
