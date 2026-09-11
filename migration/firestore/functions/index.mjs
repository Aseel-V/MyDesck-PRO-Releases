import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { saveTripTransaction } from './save-trip-transaction.mjs';
import { recordPayment as pay, setTripState as state, travelAnalytics as analytics } from './travel-operations.mjs';

// These endpoints are deliberately undeployable in Phase 2. Removing this gate
// requires a separate deployment review, IAM and App Check decisions.
if (process.env.FUNCTIONS_EMULATOR !== 'true' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('EMULATOR_FUNCTIONS_ONLY');
const app = initializeApp({ projectId: 'mydesck-migration-proof' });
const deps = { db: getFirestore(app), Timestamp };
const callable = (operation) => onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  if (!request.auth.token.email?.startsWith('migration-test--')) throw new HttpsError('permission-denied', 'SYNTHETIC_IDENTITY_REQUIRED');
  try { return await operation(deps, request); }
  catch (error) { throw new HttpsError('failed-precondition', /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'OPERATION_REJECTED'); }
});
export const saveTrip = callable(saveTripTransaction);
export const recordPayment = callable((deps,call)=>pay(deps,call));
export const recordInstallmentPayment = callable((deps,call)=>pay(deps,call,true));
export const setTripState = callable(state);
export const travelAnalytics = callable(analytics);
