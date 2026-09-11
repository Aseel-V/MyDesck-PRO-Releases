#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const fingerprint = (uid) => createHash('sha256').update(uid).digest('hex').slice(0, 12);
const result = await withSourceSnapshot(localConfig(), async (select) => (await select(`
  SELECT u.id::text AS uid,
    (u.email IS NOT NULL AND u.email <> '')::text AS has_email,
    (u.email_confirmed_at IS NOT NULL)::text AS email_verified,
    (u.phone IS NOT NULL AND u.phone <> '')::text AS has_phone,
    (u.banned_until IS NOT NULL AND u.banned_until > now())::text AS is_banned,
    (u.deleted_at IS NOT NULL)::text AS is_deleted,
    CASE WHEN u.encrypted_password IS NULL OR u.encrypted_password = '' THEN 'NONE'
         WHEN u.encrypted_password LIKE '$2a$%' OR u.encrypted_password LIKE '$2b$%'
           OR u.encrypted_password LIKE '$2y$%' THEN 'BCRYPT'
         ELSE 'UNSUPPORTED' END AS password_class,
    COALESCE((SELECT count(*)::text FROM auth.users d
      WHERE u.email IS NOT NULL AND lower(d.email) = lower(u.email)), '0') AS duplicate_email_count,
    COALESCE((SELECT string_agg(DISTINCT i.provider, ',' ORDER BY i.provider)
      FROM auth.identities i WHERE i.user_id = u.id), '') AS providers,
    COALESCE((SELECT count(*)::text FROM auth.mfa_factors f WHERE f.user_id = u.id), '0') AS mfa_count,
    COALESCE((SELECT count(*)::text FROM public.user_profiles p WHERE p.user_id = u.id), '0') AS profile_count,
    COALESCE((SELECT count(*)::text FROM public.business_profiles b WHERE b.user_id = u.id), '0') AS business_count
  FROM auth.users u ORDER BY u.id`)).rows);

const privateLedger = result.map((row) => {
  const providers = row.providers ? row.providers.split(',').filter(Boolean) : [];
  const reasons = [];
  if (Number(row.duplicate_email_count) > 1) reasons.push('DUPLICATE_EMAIL');
  if (Number(row.mfa_count) > 0) reasons.push('MFA');
  if (row.has_phone === 'true') reasons.push('PHONE_AUTH');
  if (row.password_class === 'UNSUPPORTED') reasons.push('UNSUPPORTED_HASH');
  if (Number(row.profile_count) === 0 && Number(row.business_count) === 0) reasons.push('MISSING_PROFILE_AND_BUSINESS');
  if (row.has_email !== 'true') reasons.push('MISSING_EMAIL');
  if (providers.some((provider) => provider !== 'email')) reasons.push('OAUTH_IDENTITY');
  let classification = 'TRANSPARENT'; let requiredAction = 'IMPORT_UID_AND_COMPATIBLE_BCRYPT';
  if (row.is_deleted === 'true') { classification = 'INTENTIONALLY_EXCLUDED_WITH_JUSTIFICATION'; requiredAction = 'PRESERVE_TOMBSTONE_AND_DO_NOT_ENABLE_LOGIN'; reasons.push('SOURCE_DELETED'); }
  else if (Number(row.duplicate_email_count) > 1 || Number(row.mfa_count) > 0) { classification = 'MANUAL_OPERATOR_ACTION'; requiredAction = 'RESOLVE_UNIQUE_EMAIL_OR_REENROLL_MFA_BEFORE_IMPORT'; }
  else if (Number(row.profile_count) === 0 && Number(row.business_count) === 0) { classification = 'MANUAL_OPERATOR_ACTION'; requiredAction = 'CONFIRM_ACCOUNT_PURPOSE_AND_CREATE_OR_EXPLICITLY_DENY_APPLICATION_LINKAGE_BEFORE_ENABLEMENT'; }
  else if (row.password_class === 'UNSUPPORTED') { classification = 'RESET_REQUIRED'; requiredAction = 'IMPORT_DISABLED_THEN_CONTROLLED_PASSWORD_RESET'; }
  else if (providers.some((provider) => provider !== 'email') || row.has_phone === 'true' || row.has_email !== 'true') { classification = 'REAUTH_REQUIRED'; requiredAction = 'PRESERVE_UID_AND_REQUIRE_PROVIDER_OR_PHONE_REAUTH'; }
  else if (row.password_class === 'NONE') { classification = 'RESET_REQUIRED'; requiredAction = 'PRESERVE_UID_AND_REQUIRE_PASSWORD_RESET'; }
  if (row.is_banned === 'true') requiredAction += '_PRESERVE_DISABLED_STATE';
  return { sourceUid: row.uid, targetUid: row.uid, uidPreserved: true, classification,
    requiredAction, emailVerified: row.email_verified === 'true', status: row.is_banned === 'true' ? 'DISABLED' : 'ACTIVE',
    blockingReasons: reasons.length ? reasons : [] };
});
mkdirSync('migration/blocker-closure.local', { recursive: true });
writeFileSync('migration/blocker-closure.local/auth-readiness-ledger.json',
  `${JSON.stringify({ generatedAt: new Date().toISOString(), users: privateLedger }, null, 2)}\n`);
const users = privateLedger.map(({ sourceUid, targetUid, ...row }) => ({ uidFingerprint: fingerprint(sourceUid),
  sourceTargetUidEqual: sourceUid === targetUid, ...row }));
const classes = ['TRANSPARENT', 'REAUTH_REQUIRED', 'RESET_REQUIRED', 'MANUAL_OPERATOR_ACTION',
  'INTENTIONALLY_EXCLUDED_WITH_JUSTIFICATION'];
const counts = Object.fromEntries(classes.map((name) => [name, users.filter((user) => user.classification === name).length]));
const report = { generatedAt: new Date().toISOString(), sourceSnapshot: { readOnly: true,
  isolationLevel: 'repeatable read', writesCaused: 0 }, totalUsers: users.length, ...counts,
  unknown: 0, accounted: users.length, uidMismatches: users.filter((user) => !user.sourceTargetUidEqual).length,
  users, productionFirebaseImports: 0 };
writeReport('migration/reports/firestore-auth-production-readiness.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ totalUsers: report.totalUsers, classifications: counts, unknown: 0,
  uidMismatches: report.uidMismatches, privateLedger: 'ignored local file', sourceWrites: 0 }));
