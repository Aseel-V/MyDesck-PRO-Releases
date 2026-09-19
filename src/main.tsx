import { selectBackend } from './data/backendMode';

const isElectron = Boolean(window.electronAPI);
const isInternalInvoice = new URLSearchParams(window.location.search).get('invoice') === 'true';

if (!isElectron && !isInternalInvoice) {
  void import('./web-main');
} else {
  const mode = selectBackend(import.meta.env, location.hostname);
  if (mode === 'supabase') void import('./production-main');
  else void import('./firebase-main');
}
