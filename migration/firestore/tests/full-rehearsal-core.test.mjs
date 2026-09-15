import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRESTORE_MAX_DOCUMENT_BYTES, FULL_TRANSFORM_VERSION, authDerivedDocument, businessOwnerIndexDocument,
  credentialExclusions, documentId, indexRisk, sizeClass, sourceKey, targetPath,
  topologicalTables,
} from '../lib/full-rehearsal-core.mjs';

test('credential fields are explicitly excluded instead of silently copied', () => {
  const fields = credentialExclusions('restaurant_staff', [
    { name: 'full_name' }, { name: 'pin_code' }, { name: 'pin_hash' }, { name: 'password' },
  ]);
  assert.deepEqual(fields.map((field) => field.field), ['pin_code', 'pin_hash', 'password']);
  assert.ok(fields.every((field) => field.reason === 'CREDENTIAL_REPROVISION_REQUIRED'));
});

test('source and target ids are deterministic for simple and composite keys', () => {
  assert.equal(sourceKey('t', ['id'], { id: 'a/b' }), 't#a%2Fb');
  assert.equal(documentId('whatsapp_server_templates', ['template_key', 'language'],
    { template_key: 'receipt', language: 'ar' }), 'receipt__ar');
  assert.equal(documentId('trips', ['id'], { id: 'trip-1' }), 'trip-1');
});

test('production-intended nested path is resolved from tenancy', () => {
  const path = targetPath({
    mapping: { target: 'businesses/{businessId}/orders/{orderId}' },
    table: { name: 'restaurant_orders' }, row: { id: 'o1' }, docId: 'o1',
    tenancy: { businessId: 'b1', ownerUid: 'u1' },
  });
  assert.equal(path, 'businesses/b1/orders/o1');
});

test('topological ordering places referenced parents before children', () => {
  const order = topologicalTables([
    { name: 'child', foreignKeys: [{ parent: 'public.parent' }] },
    { name: 'parent', foreignKeys: [] },
  ]);
  assert.deepEqual(order, ['parent', 'child']);
});

test('size and index gates block Firestore hard-limit risks', () => {
  assert.equal(sizeClass(100), 'SAFE');
  assert.equal(sizeClass(900 * 1024), 'NEAR_LIMIT');
  assert.equal(sizeClass(FIRESTORE_MAX_DOCUMENT_BYTES), 'TOO_LARGE');
  assert.equal(indexRisk({ items: Array.from({ length: 40_000 }, (_, i) => i) }).pathological, true);
});

test('derived auth document preserves UID and transform version', () => {
  const doc = authDerivedDocument('uid-1', 'business-1');
  assert.equal(doc.uid, 'uid-1');
  assert.equal(doc.userId, 'uid-1');
  assert.equal(doc.ownerUid, 'uid-1');
  assert.equal(doc.migrationTransformVersion, FULL_TRANSFORM_VERSION);
});

test('every migrated business gets an owner index with exactly the keys the Rules allow', () => {
  const doc = businessOwnerIndexDocument('uid-1', 'business-1');
  assert.equal(doc.uid, 'uid-1');
  assert.equal(doc.businessId, 'business-1');
  assert.equal(doc.schemaVersion, 1, 'the Rules accept only schemaVersion 1 on an index document');
  assert.equal(doc.migrationTransformVersion, FULL_TRANSFORM_VERSION);
  const rules = readFileSync('migration/firestore/rules/firestore.rules', 'utf8');
  const block = rules.slice(rules.indexOf('match /businessOwners/{ownerUid} {'));
  const allowed = [...block.match(/hasOnly\(\[([^\]]+)\]\)/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(doc).filter((key) => !allowed.includes(key)), []);
});

