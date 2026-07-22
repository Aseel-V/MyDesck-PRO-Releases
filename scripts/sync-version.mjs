import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid SemVer version in package.json: "${version}"`);
  process.exit(1);
}

// 1. Sync package-lock.json
if (existsSync('package-lock.json')) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log(`[sync-version] Updated package-lock.json to v${version}`);
}

// 2. Sync public/version.json
if (existsSync('public/version.json')) {
  const vMeta = JSON.parse(readFileSync('public/version.json', 'utf8'));
  vMeta.version = version;
  writeFileSync('public/version.json', JSON.stringify(vMeta, null, 2) + '\n', 'utf8');
  console.log(`[sync-version] Updated public/version.json to v${version}`);
}

// 3. Sync public/release-notes.json
if (existsSync('public/release-notes.json')) {
  const rNotes = JSON.parse(readFileSync('public/release-notes.json', 'utf8'));
  rNotes.version = version;
  writeFileSync('public/release-notes.json', JSON.stringify(rNotes, null, 2) + '\n', 'utf8');
  console.log(`[sync-version] Updated public/release-notes.json to v${version}`);
}

// 4. Sync dist version metadata if dist exists
if (existsSync('dist/version.json')) {
  const dMeta = JSON.parse(readFileSync('dist/version.json', 'utf8'));
  dMeta.version = version;
  writeFileSync('dist/version.json', JSON.stringify(dMeta, null, 2) + '\n', 'utf8');
}
if (existsSync('dist/release-notes.json')) {
  const dNotes = JSON.parse(readFileSync('dist/release-notes.json', 'utf8'));
  dNotes.version = version;
  writeFileSync('dist/release-notes.json', JSON.stringify(dNotes, null, 2) + '\n', 'utf8');
}

console.log(`[sync-version] All version sources successfully synchronized to v${version}`);
