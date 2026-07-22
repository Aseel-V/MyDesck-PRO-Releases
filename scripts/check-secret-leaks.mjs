import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

console.log('[check-secret-leaks] Scanning codebase for secret leaks, hardcoded credentials, and committed .env files...');

const forbiddenPatterns = [
  { pattern: /StagingPass123/i, description: 'Disclosed staging sample password' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, description: 'Private RSA/ECC key' },
  { pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/, description: 'Postgres connection string with embedded password' },
];

const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'release', '.next', 'build']);

function scanDirectory(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile()) {
      // Check for committed .env files containing sensitive values
      if (entry === '.env' || entry.startsWith('.env.')) {
        const content = readFileSync(fullPath, 'utf8');
        if (content.includes('SERVICE_ROLE') || content.includes('DATABASE_URL')) {
          assert.fail(`Committed env file ${fullPath} contains secret keys`);
        }
      }

      // Check text files for secret patterns
      if (/\.(mjs|js|ts|tsx|json|md|yml|yaml|sql|txt)$/i.test(entry) && !fullPath.includes('check-secret-leaks.mjs')) {
        const content = readFileSync(fullPath, 'utf8');
        for (const item of forbiddenPatterns) {
          if (item.pattern.test(content)) {
            assert.fail(`Secret leak detected in ${fullPath}: ${item.description}`);
          }
        }
      }
    }
  }
}

scanDirectory('.');

console.log('[check-secret-leaks] SECRET SCANNING GATE PASSED: No hardcoded secrets, private keys, or exposed passwords detected.');
