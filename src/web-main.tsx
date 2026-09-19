import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/hebrew-600.css';
import '@fontsource/rubik/hebrew-700.css';
import './index.css';
import './marketing/marketing.css';
import WebRoot from './WebRoot';
import { legacyHashSearch, resolveLegacyHash } from './marketing/routes/routeModel';

const legacyDestination = resolveLegacyHash(window.location.hash);
if (legacyDestination) {
  window.history.replaceState(null, '', `${legacyDestination}${legacyHashSearch(window.location.hash)}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><WebRoot /></StrictMode>,
);
