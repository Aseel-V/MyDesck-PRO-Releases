import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

console.log('[check-pwa-cache-contract] Verifying PWA and website cache headers contract...');

// 1. Verify vite.config.ts
const viteConfig = readFileSync('vite.config.ts', 'utf8');
assert.ok(viteConfig.includes("registerType: 'prompt'"), "vite.config.ts must specify registerType: 'prompt'");
assert.ok(viteConfig.includes('cleanupOutdatedCaches: true'), 'vite.config.ts must specify cleanupOutdatedCaches: true');
assert.ok(viteConfig.includes('/^\\/version\\.json$/'), 'vite.config.ts navigateFallbackDenylist must exclude /version.json');
assert.ok(viteConfig.includes('/^\\/release-notes\\.json$/'), 'vite.config.ts navigateFallbackDenylist must exclude /release-notes.json');

// 2. Verify vercel.json
const vercelJson = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(Array.isArray(vercelJson.headers), 'vercel.json must define headers array');

const noCacheHeader = vercelJson.headers.find((h) => h.source.includes('version.json'));
assert.ok(noCacheHeader, 'vercel.json must define header rule for version.json');
const ccVal = noCacheHeader.headers.find((kv) => kv.key === 'Cache-Control')?.value || '';
assert.ok(ccVal.includes('no-cache'), 'version.json Cache-Control must include no-cache');

const assetsHeader = vercelJson.headers.find((h) => h.source.includes('/assets/'));
assert.ok(assetsHeader, 'vercel.json must define header rule for /assets/');
const assetsCcVal = assetsHeader.headers.find((kv) => kv.key === 'Cache-Control')?.value || '';
assert.ok(assetsCcVal.includes('immutable'), 'assets Cache-Control must include immutable');

console.log('[check-pwa-cache-contract] PWA AND WEBSITE CACHE HEADERS CONTRACT PASSED.');
