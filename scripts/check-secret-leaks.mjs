import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

console.log('[check-secret-leaks] Scanning codebase for secret leaks, hardcoded credentials, and committed .env files...');

const forbiddenPatterns = [
  { pattern: /StagingPass123/i, description: 'Disclosed staging sample password' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]{100,}?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, description: 'Private RSA/ECC key material' },
  { pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]{12,}@/, description: 'Postgres connection string with embedded non-placeholder password' },
  { pattern: /VITE_WHATSAPP_(?:ACCESS_TOKEN|APP_SECRET|VERIFY_TOKEN|PHONE_NUMBER_ID|BUSINESS_ACCOUNT_ID)/, description: 'WhatsApp server secret exposed through Vite' },
  { pattern: /EA[A-Za-z0-9]{80,}/, description: 'Possible hardcoded Meta access token' },
  { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/, description: 'GitHub token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, description: 'GitHub fine-grained token' },
  { pattern: /Authorization\s*[:=]\s*['"]Bearer\s+[A-Za-z0-9._-]{30,}['"]/, description: 'Hardcoded bearer credential' },
  { pattern: /"private_key"\s*:\s*"-----BEGIN/, description: 'Service-account private key JSON' },
];

const candidatePaths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
).split('\0').filter(Boolean);

for (const filePath of candidatePaths) {
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue;
  const fileName = filePath.replaceAll('\\', '/').split('/').at(-1);

  if ((fileName === '.env' || fileName?.startsWith('.env.')) && fileName !== '.env.example') {
    const content = readFileSync(filePath, 'utf8');
    if (/^(?:SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|FIREBASE_PRIVATE_KEY)=\S+/m.test(content)) {
      assert.fail(`Committed env file ${filePath} contains a privileged credential`);
    }
  }

  if (/\.(mjs|js|ts|tsx|json|md|yml|yaml|sql|txt)$/i.test(filePath) && !filePath.endsWith('check-secret-leaks.mjs')) {
    const content = readFileSync(filePath, 'utf8');
    for (const item of forbiddenPatterns) {
      if (item.pattern.test(content)) {
        assert.fail(`Secret leak detected in ${filePath}: ${item.description}`);
      }
    }
  }
}

console.log('[check-secret-leaks] SECRET SCANNING GATE PASSED: No hardcoded secrets, private keys, or exposed passwords detected.');
