import { selectBackend } from './data/backendMode';
const mode = selectBackend(import.meta.env, location.hostname);
if (mode === 'supabase') void import('./production-main');
else void import('./firebase-main');
