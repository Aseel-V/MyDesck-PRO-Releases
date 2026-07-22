import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';

const mode = process.argv[2];
const feedValue = process.env.STAGING_UPDATER_FEED_URL;
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const installerFilename = 'MyDesck-PRO-Setup.exe';
const assets = [
  { filename: 'latest.yml', types: ['application/yaml', 'text/yaml', 'text/plain', 'application/octet-stream'] },
  { filename: installerFilename, types: ['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable'], range: true },
  { filename: `${installerFilename}.blockmap`, types: ['application/octet-stream', 'application/json'], range: true },
];

function fail(message) {
  console.error(`STAGING UPDATER FEED: BLOCKED - ${message}`);
  process.exit(1);
}

function validateFeedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('feed URL is missing or invalid');
  }

  const normalizedTarget = `${url.hostname}${url.pathname}`.toLowerCase();
  if (url.protocol !== 'https:') fail('feed URL must use HTTPS');
  if (url.username || url.password) fail('feed URL must not contain embedded credentials');
  if (
    normalizedTarget.includes('github.com/aseel-v/mydesck-pro-releases') ||
    normalizedTarget.includes('mydesck.app') ||
    normalizedTarget.includes('my-desck-pro.vercel.app')
  ) {
    fail('feed URL must not target production');
  }

  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function assetUrl(baseUrl, filename) {
  const url = new URL(baseUrl);
  url.pathname += encodeURIComponent(filename);
  return url;
}

function assertNoRedirect(response, filename) {
  if (response.status >= 300 && response.status < 400) {
    fail(`${filename} redirected; staging assets must resolve directly and never redirect to production`);
  }
}

function assertContentType(response, asset) {
  const actual = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!asset.types.includes(actual)) {
    fail(`${asset.filename} returned an inappropriate content type`);
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: controller.signal });
  } catch {
    fail('staging feed request failed');
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyLiveAsset(baseUrl, asset) {
  const url = assetUrl(baseUrl, asset.filename);
  const head = await request(url, { method: 'HEAD' });
  assertNoRedirect(head, asset.filename);
  if (head.status !== 200) fail(`${asset.filename} returned HTTP ${head.status}; expected HTTP 200`);
  assertContentType(head, asset);

  const declaredLength = Number(head.headers.get('content-length') || 0);
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    const download = await request(url);
    assertNoRedirect(download, asset.filename);
    if (download.status !== 200) fail(`${asset.filename} download returned HTTP ${download.status}; expected HTTP 200`);
    const chunk = await download.body?.getReader().read();
    await download.body?.cancel();
    if (!chunk?.value?.byteLength) fail(`${asset.filename} has no Content-Length and downloaded zero bytes`);
  }

  if (asset.range) {
    const rangeResponse = await request(url, { headers: { Range: 'bytes=0-0' } });
    assertNoRedirect(rangeResponse, asset.filename);
    if (rangeResponse.status !== 206 || !rangeResponse.headers.get('content-range')) {
      fail(`${asset.filename} does not support byte range requests required by electron-updater`);
    }
    const rangeBytes = new Uint8Array(await rangeResponse.arrayBuffer());
    if (rangeBytes.byteLength !== 1) fail(`${asset.filename} returned an invalid byte range response`);
  }
}

const baseUrl = validateFeedUrl(feedValue);

if (mode === '--configuration') {
  console.log('Staging updater feed configuration preflight passed.');
  process.exit(0);
}

if (mode !== '--live') {
  fail('usage: verify-staging-updater-feed.mjs --configuration|--live');
}

for (const asset of assets) await verifyLiveAsset(baseUrl, asset);

const latestResponse = await request(assetUrl(baseUrl, 'latest.yml'));
assertNoRedirect(latestResponse, 'latest.yml');
if (latestResponse.status !== 200) fail(`latest.yml returned HTTP ${latestResponse.status}; expected HTTP 200`);
const latestText = await latestResponse.text();
if (!Buffer.byteLength(latestText)) fail('latest.yml downloaded zero bytes');

let latest;
try {
  latest = parseYaml(latestText);
} catch {
  fail('latest.yml is not valid YAML');
}

assert.ok(latest && typeof latest === 'object' && !Array.isArray(latest), 'latest.yml must parse to an object');
if (String(latest.version) !== packageVersion) fail('latest.yml version does not equal the candidate package version');

const referencedFiles = [latest.path, ...(Array.isArray(latest.files) ? latest.files.map((file) => file?.url) : [])]
  .filter((value) => typeof value === 'string');
if (!referencedFiles.includes(installerFilename)) fail('latest.yml does not reference the exact installer filename');

const installerEntry = Array.isArray(latest.files)
  ? latest.files.find((file) => file?.url === installerFilename)
  : undefined;
const sha512 = installerEntry?.sha512 || latest.sha512;
if (typeof sha512 !== 'string' || sha512.trim() === '') fail('latest.yml is missing the installer SHA512 field');

console.log('Live staging updater feed asset verification passed.');
