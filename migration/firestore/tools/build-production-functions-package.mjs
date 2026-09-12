#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const firestoreRoot = resolve(here, '..');
const output = resolve(firestoreRoot, '..', 'production-prep.local', 'functions-package');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const copyTree = (source, target) => {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const sourcePath = resolve(source, entry);
    const targetPath = resolve(target, entry);
    if (statSync(sourcePath).isDirectory()) copyTree(sourcePath, targetPath);
    else writeFileSync(targetPath, readFileSync(sourcePath), { mode: 0o600 });
  }
};
copyTree(resolve(firestoreRoot, 'functions'), resolve(output, 'functions'));
copyTree(resolve(firestoreRoot, 'lib'), resolve(output, 'lib'));

const sourcePackage = JSON.parse(readFileSync(resolve(firestoreRoot, 'package.json'), 'utf8'));
writeFileSync(resolve(output, 'package.json'), `${JSON.stringify({
  ...sourcePackage,
  name: 'mydesck-firestore-production-functions',
  main: 'functions/production-index.mjs',
}, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  status: 'BUILT',
  output: 'migration/production-prep.local/functions-package',
  entrypoint: 'functions/production-index.mjs',
  productionWrites: 0,
}));
