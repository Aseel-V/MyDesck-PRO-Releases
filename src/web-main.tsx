import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
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
