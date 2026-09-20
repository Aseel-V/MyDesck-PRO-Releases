import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  industryReadiness,
  legacyHashSearch,
  localizePath,
  marketingPaths,
  parseLocalizedPath,
  resolveLegacyHash,
} from '../src/marketing/routes/routeModel.ts';
import { getRouteMetadata, routeMetadata } from '../src/marketing/seo/routeMetadata.ts';

assert.equal(resolveLegacyHash('#/solutions/trip'), '/solutions/travel-agencies');
assert.equal(resolveLegacyHash('#/solutions/market'), '/solutions/supermarkets');
assert.equal(resolveLegacyHash('#/solutions/food'), '/solutions/restaurants');
assert.equal(resolveLegacyHash('#/solutions/not-real'), null);
assert.equal(legacyHashSearch('#/reset-password?oobCode=example'), '?oobCode=example');
assert.deepEqual(parseLocalizedPath('/ar/solutions/restaurants'), { locale: 'ar', basePath: '/solutions/restaurants' });
assert.deepEqual(parseLocalizedPath('/he/pricing/'), { locale: 'he', basePath: '/pricing' });
assert.equal(localizePath('/ar/features', 'he'), '/he/features');
assert.equal(localizePath('/he/features', 'en'), '/features');

for (const path of marketingPaths) assert.ok(routeMetadata.some((entry) => entry.path === path && entry.indexable), `Missing indexable metadata for ${path}`);
for (const path of ['/login', '/forgot-password', '/reset-password', '/dashboard']) assert.equal(getRouteMetadata(path).indexable, false, `${path} must be noindex`);
assert.deepEqual(Object.keys(industryReadiness).sort(), ['auto-repair', 'restaurants', 'supermarkets', 'travel-agencies']);
for (const placeholder of ['car-parts', 'phone-shop', 'clothes-shop', 'furniture-store']) assert.equal(Object.prototype.hasOwnProperty.call(industryReadiness, placeholder), false);

const webMain = await readFile(new URL('../src/web-main.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(webMain, /CurrencyProvider|createFirestoreBackend|firebaseClient|Dashboard/);
const webRoot = await readFile(new URL('../src/WebRoot.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(webRoot, /CurrencyProvider|PersistQueryClientProvider|WebsiteUpdateNotice/);
const prerenderTool = await readFile('scripts/generate-marketing-artifacts.mjs', 'utf8');
const electronMain = await readFile('electron.js', 'utf8');
assert.match(prerenderTool, /electron\.html[^\n]+shell/);
assert.match(electronMain, /dist[^\n]+electron\.html/);
assert.ok(electronMain.indexOf('fs.existsSync(electronPath)') < electronMain.indexOf('fs.existsSync(distPath)'), 'Electron must prefer the relative-asset shell');
console.log('public route and marketing-boundary tests passed');
