import { createHash } from 'node:crypto';

const PATTERNS = [
  { type: 'GITHUB_CLASSIC_PAT', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  { type: 'GITHUB_FINE_GRAINED_PAT', regex: /github_pat_[A-Za-z0-9_]{50,255}/g },
];

export function scanSecretText(text, file = '<memory>') {
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1);
  for (const { type, regex } of PATTERNS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      let low = 0; let high = lineStarts.length;
      while (low + 1 < high) { const mid = (low + high) >> 1; if (lineStarts[mid] <= match.index) low = mid; else high = mid; }
      findings.push({ file, line: low + 1, type,
        fingerprintSha256Prefix: createHash('sha256').update(match[0]).digest('hex').slice(0, 12) });
    }
  }
  return findings;
}

export function redactSecretText(text) {
  let output = text;
  for (const { regex } of PATTERNS) { regex.lastIndex = 0; output = output.replace(regex, '[REDACTED-COMPROMISED-CREDENTIAL]'); }
  return output;
}
