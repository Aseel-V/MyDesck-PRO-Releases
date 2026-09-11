#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { scanSecretText } from '../lib/secret-scanner.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
const findings = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  findings.push(...scanSecretText(text, file));
}
const report = { generatedAt: new Date().toISOString(), scannedFiles: files.length,
  activeFindings: findings.length, findings, valuePrinted: false,
  status: findings.length ? 'ACTIVE_SECRET_PATTERN_FOUND' : 'PASS' };
writeReport('migration/reports/active-secret-regression.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ scannedFiles: files.length, activeFindings: findings.length,
  status: report.status, valuePrinted: false }));
if (findings.length) process.exitCode = 1;
