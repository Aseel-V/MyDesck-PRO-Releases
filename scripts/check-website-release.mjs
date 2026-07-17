import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const OWNER = 'Aseel-V';
const REPO = 'MyDesck-PRO-Releases';
const INSTALLER = 'MyDesck-PRO-Setup.exe';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const DOWNLOAD_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${INSTALLER}`;
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'MyDesck-PRO-release-check' };

function isStableRelease(release) {
  return release?.draft === false
    && release?.prerelease === false
    && /^v?\d+\.\d+\.\d+$/.test(release?.tag_name || '');
}

assert.equal(isStableRelease({ tag_name: 'v1.2.3', draft: false, prerelease: false }), true);
assert.equal(isStableRelease({ tag_name: 'v1.2.4', draft: true, prerelease: false }), false);
assert.equal(isStableRelease({ tag_name: 'v1.2.4-beta.1', draft: false, prerelease: true }), false);

const repositoryResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers });
assert.equal(repositoryResponse.ok, true, `GitHub repository lookup failed: ${repositoryResponse.status}`);
const repository = await repositoryResponse.json();
assert.equal(repository.private, false, 'Release repository must remain public for browser downloads');

const releaseResponse = await fetch(API_URL, { headers });
assert.equal(releaseResponse.ok, true, `Latest release lookup failed: ${releaseResponse.status}`);
const release = await releaseResponse.json();
assert.equal(isStableRelease(release), true, 'Latest API response must be a stable published release');

const installer = release.assets.find((asset) => asset.name === INSTALLER);
assert.ok(installer, `Latest stable release ${release.tag_name} is missing ${INSTALLER}`);
assert.equal(new URL(installer.browser_download_url).protocol, 'https:');
assert.equal(new URL(installer.browser_download_url).hostname, 'github.com');

const downloadResponse = await fetch(DOWNLOAD_URL, { method: 'HEAD', redirect: 'follow' });
assert.equal(downloadResponse.ok, true, `Stable installer URL failed: ${downloadResponse.status}`);
const disposition = downloadResponse.headers.get('content-disposition') || '';
assert.ok(
  disposition.includes(INSTALLER) || installer.browser_download_url.endsWith(`/${INSTALLER}`),
  'Resolved download does not identify the expected installer'
);

const websiteFiles = [
  'src/pages/LandingPage.tsx',
  'src/pages/solutions/SolutionPage.tsx',
  'src/components/DownloadModal.tsx',
  'src/hooks/useGitHubRelease.ts',
];
const source = websiteFiles.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
assert.doesNotMatch(source, /href=.*(?:latest\.yml|\.blockmap)/i);
assert.doesNotMatch(source, /MyDesck-PRO-0\.0\.\d+\.dmg/);
assert.doesNotMatch(source, /V\s*0\.0\.\d+\s+Available Now/i);
assert.doesNotMatch(source, /(?:github|gh)[_-]?token\s*[:=]/i);
assert.match(source, /MyDesck-PRO-Setup\.exe/);

console.log(`Website release checks passed: ${release.tag_name}, ${INSTALLER}, ${installer.size} bytes.`);
