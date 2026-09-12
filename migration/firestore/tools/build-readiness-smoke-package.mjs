#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
const out='migration/env-blocker-closure.local/smoke-functions';
// Exact allowlist; no source tree recursion or deletion.
for(const file of ['functions/production-readiness-smoke.mjs','functions/readiness-smoke-core.mjs','lib/environment-readiness.mjs']) {
  mkdirSync(dirname(`${out}/${file}`),{recursive:true});
  copyFileSync(`migration/firestore/${file}`,`${out}/${file}`);
}
const source=JSON.parse(readFileSync('migration/firestore/package.json','utf8'));
writeFileSync(`${out}/package.json`,JSON.stringify({...source,name:'mydesck-isolated-readiness-smoke',main:'functions/production-readiness-smoke.mjs'},null,2)+'\n');
copyFileSync('migration/firestore/config/readiness-smoke-package-lock.json',`${out}/package-lock.json`);
console.log(JSON.stringify({status:'BUILT',output:out,productionMutations:0}));
