#!/usr/bin/env node
/**
 * Source coverage controls.
 *
 * The requirement is that Unknown = 0: every table in the live source has a
 * decision, and every decision names a table the source still has. This suite
 * enforces both directions and fails on drift, so a schema change upstream
 * breaks the build instead of leaving rows with nowhere to go.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TABLE_MAP, TABLE_MAP_BY_NAME, MILESTONE_1_TABLES, PROOF_PREFIX,
  proofCollection, validateTableMap, SCHEMA_VERSION, TRANSFORM_VERSION,
} from '../lib/table-map.mjs';
import { ENTITIES, ENTITY_ORDER } from '../lib/entities.mjs';

const inventory = JSON.parse(
  readFileSync('migration/reports/firestore-source-domain-inventory.json', 'utf8'));
const liveTables = inventory.tables.map((t) => t.name);

test('every live source table has a mapping decision', () => {
  const result = validateTableMap(liveTables);
  assert.deepEqual(result.unmapped, [], 'these source tables have no decision');
  assert.deepEqual(result.stale, [], 'these decisions name tables the source no longer has');
  assert.deepEqual(result.duplicates, [], 'a table decided on twice');
  assert.equal(result.unknown, 0);
  assert.equal(result.ok, true);
  assert.equal(result.liveTables, result.mappedTables);
});

test('coverage drift in either direction is caught', () => {
  // Adding a table upstream must fail the check rather than pass quietly.
  const withExtra = validateTableMap([...liveTables, 'a_brand_new_table']);
  assert.equal(withExtra.ok, false);
  assert.deepEqual(withExtra.unmapped, ['a_brand_new_table']);
  assert.equal(withExtra.unknown, 1);

  // So must a decision for a table that no longer exists.
  const withMissing = validateTableMap(liveTables.filter((n) => n !== 'trips'));
  assert.equal(withMissing.ok, false);
  assert.deepEqual(withMissing.stale, ['trips']);
});

test('every decision uses the agreed vocabulary and names a target', () => {
  const allowed = new Set(['TOP_LEVEL_COLLECTION', 'SUBCOLLECTION', 'EMBED', 'MERGE',
    'DERIVED', 'ARCHIVE', 'KEEP', 'REMOVE_LATER']);
  for (const entry of TABLE_MAP) {
    assert.equal(allowed.has(entry.disposition), true,
      `${entry.name} has disposition ${entry.disposition}`);
    assert.equal(typeof entry.target === 'string' && entry.target.length > 0, true,
      `${entry.name} has no target path`);
    assert.equal([1, 2, 3].includes(entry.milestone), true, `${entry.name} milestone`);
    assert.equal(typeof entry.note === 'string' && entry.note.length > 20, true,
      `${entry.name} must justify its decision`);
  }
});

test('nothing is scheduled for removal without evidence it is dead', () => {
  // "Do not remove functionality during the first parity migration" — a
  // REMOVE_LATER decision here would be exactly that, so there should be none.
  const removals = TABLE_MAP.filter((e) => e.disposition === 'REMOVE_LATER');
  assert.deepEqual(removals.map((e) => e.name), []);
});

test('the milestone-1 set matches the entities that are actually migrated', () => {
  assert.deepEqual([...MILESTONE_1_TABLES].sort(), Object.keys(ENTITIES).sort());
  assert.deepEqual([...ENTITY_ORDER].sort(), Object.keys(ENTITIES).sort(),
    'the migration order must cover every entity exactly once');
  assert.equal(new Set(ENTITY_ORDER).size, ENTITY_ORDER.length, 'no entity listed twice');
});

test('required parents are migrated before their children', () => {
  const position = new Map(ENTITY_ORDER.map((name, i) => [name, i]));
  const collectionToTable = new Map(
    Object.entries(ENTITIES).map(([table, entity]) => [entity.collection, table]));
  for (const [table, entity] of Object.entries(ENTITIES)) {
    for (const reference of entity.references) {
      if (!reference.required) continue;
      const parentTable = collectionToTable.get(reference.collection);
      if (!parentTable || parentTable === table) continue;
      assert.ok(position.get(parentTable) < position.get(table),
        `${table} requires ${reference.collection}, so it must be migrated after it`);
    }
  }
});

test('the users-businesses cycle is real, and only its optional edge is unordered', () => {
  // The source genuinely cycles: business_profiles.user_id references a user,
  // and user_profiles.business_id references a business. No ordering satisfies
  // both, so the optional edge is the one left unordered — and the orphan
  // checker runs after every entity is migrated, where the cycle is resolved.
  const userToBusiness = ENTITIES.user_profiles.references
    .find((r) => r.collection === 'businesses');
  assert.ok(userToBusiness, 'user_profiles must declare its business reference');
  assert.equal(userToBusiness.required, false,
    'business_id is nullable in the source, so the edge must be optional');
  assert.ok(ENTITY_ORDER.indexOf('user_profiles') < ENTITY_ORDER.indexOf('business_profiles'),
    'users come first, so businesses can carry an owner that already exists');
});

test('no migrated entity uses a generated document id', () => {
  for (const [table, entity] of Object.entries(ENTITIES)) {
    assert.ok(entity.sourcePrimaryKey.length > 0, `${table} must declare its source key`);
    const source = entity.docId.toString();
    assert.equal(/\.doc\(\)\s*\.id|randomUUID|Math\.random/.test(source), false,
      `${table} must derive its document id from the source primary key`);
  }
});

test('document ids are deterministic and stable across calls', () => {
  const uuidRow = { id: '7a2849f6-61ef-402e-91e4-0e0f70c1ad9b',
    user_id: 'b4a1c115-62e0-4cd8-a8cd-5e19ecb73496', client_request_id: 'req-1' };
  const identityRow = { ...uuidRow, id: '723' };
  for (const [table, entity] of Object.entries(ENTITIES)) {
    // Identity-keyed entities take a numeric id; the rest take a UUID.
    const row = entity.appendOnly ? identityRow : uuidRow;
    assert.equal(entity.docId(row), entity.docId(row), `${table} must be deterministic`);
  }
  assert.equal(ENTITIES.user_profiles.docId(uuidRow), uuidRow.user_id,
    'the user id IS the document id');
  assert.equal(ENTITIES.trips.docId(uuidRow), uuidRow.id);
  assert.equal(ENTITIES.trip_write_requests.docId(uuidRow),
    `${uuidRow.user_id}__${uuidRow.client_request_id}`);
  assert.equal(ENTITIES.trip_financial_audit.docId(identityRow), '0'.repeat(16) + '723');
});

test('BIGINT identity ids sort in numeric order as document ids', () => {
  // Firestore orders document ids lexically. "10" before "9" is how event
  // history silently reorders, so identity keys are zero-padded.
  const ids = ['9', '10', '100'].map((id) => ENTITIES.trip_financial_audit.docId({ id }));
  assert.deepEqual([...ids].sort(), ids, 'lexical order must equal numeric order');
  assert.equal(ids[0].length, 19);
  assert.throws(() => ENTITIES.trip_financial_audit.docId({ id: 'abc' }),
    /NON_NUMERIC_IDENTITY_KEY/);
  assert.throws(() => ENTITIES.trip_financial_audit.docId({ id: '1'.repeat(20) }),
    /IDENTITY_KEY_TOO_LARGE/);
});

test('append-only entities declare an ordering contract', () => {
  for (const [table, entity] of Object.entries(ENTITIES)) {
    if (!entity.appendOnly) continue;
    assert.ok(entity.ordering, `${table} is append-only and must declare its ordering`);
    assert.ok(entity.ordering.parentField, `${table} ordering needs a parent`);
    assert.equal(entity.ordering.sequenceField, 'sequence');
  }
});

test('the proof namespace cannot collide with an application collection', () => {
  const applicationCollections = new Set(
    Object.values(ENTITIES).map((e) => e.collection));
  for (const collection of applicationCollections) {
    const proof = proofCollection(collection);
    assert.equal(proof.startsWith(PROOF_PREFIX), true);
    assert.equal(applicationCollections.has(proof), false,
      `${proof} must not itself be an application collection`);
  }
  // Prefixing is idempotent, so a double-prefixed path cannot escape the guard.
  assert.equal(proofCollection(proofCollection('trips')), proofCollection('trips'));
  assert.equal(proofCollection('trips'), 'migration_test_v1_trips');
});

test('versions are declared and consistent', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(TRANSFORM_VERSION, 1);
  assert.equal(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 1, true);
});

test('every quarantined or hash-chained table is flagged where it matters', () => {
  const whatsapp = TABLE_MAP.filter((e) => e.domain === 'whatsapp');
  assert.equal(whatsapp.length > 0, true);
  assert.equal(whatsapp.every((e) => e.quarantined === true), true,
    'WhatsApp automation must stay quarantined');
  const fiscal = TABLE_MAP.filter((e) => e.domain === 'fiscal');
  assert.equal(fiscal.every((e) => e.hashChained === true && e.appendOnly === true), true,
    'fiscal records are hash-chained and append-only');
  assert.equal(TABLE_MAP_BY_NAME.get('restaurant_whatsapp_messages').quarantined, true);
});
