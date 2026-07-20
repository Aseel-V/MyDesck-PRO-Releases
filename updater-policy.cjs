'use strict';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseStableVersion(version) {
  if (typeof version !== 'string') return null;
  const clean = version.replace(/^[vV]/, '');
  if (!STABLE_SEMVER.test(clean)) return null;
  return clean.split('.').map(Number);
}

function isHigherStableVersion(candidate, current) {
  const next = parseStableVersion(candidate);
  const installed = parseStableVersion(current);
  if (!next || !installed) return false;

  for (let index = 0; index < 3; index += 1) {
    if (next[index] > installed[index]) return true;
    if (next[index] < installed[index]) return false;
  }
  return false;
}

function normalizeProgress(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(100, Math.max(0, numericValue));
}

module.exports = { isHigherStableVersion, normalizeProgress, parseStableVersion };
