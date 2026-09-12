import assert from 'node:assert/strict';
import { assertProductionFirestoreIdentity, firestoreOnlyWrite } from '../src/data/productionBackend';
import { FROZEN_OPERATIONS, MAINTENANCE_MESSAGE, assertWriteAllowed } from '../src/data/maintenanceMode';

assert.doesNotThrow(() => assertProductionFirestoreIdentity('mydesckpro', 'default'));
assert.throws(() => assertProductionFirestoreIdentity('other', 'default'), /WRONG_FIREBASE_PROJECT/);
assert.throws(() => assertProductionFirestoreIdentity('mydesckpro', '(default)'), /WRONG_FIRESTORE_DATABASE/);

let attempts = 0;
const failure = await firestoreOnlyWrite(async () => { attempts += 1; throw Error('target unavailable'); });
assert.equal(failure.ok, false);
assert.equal(attempts, 1);
assert.equal('fallback' in failure, false);

for (const operation of FROZEN_OPERATIONS) {
  assert.throws(() => assertWriteAllowed(operation, true), /MAINTENANCE_WRITE_BLOCKED/);
}
assert.doesNotThrow(() => assertWriteAllowed('trip.read', true));
assert.doesNotThrow(() => assertWriteAllowed('payment.record', false));
assert.ok(MAINTENANCE_MESSAGE.length > 20);

console.log(`Production cutover controls: PASS (${FROZEN_OPERATIONS.size + 9} assertions)`);
