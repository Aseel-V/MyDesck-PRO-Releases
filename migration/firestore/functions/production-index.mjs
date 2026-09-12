import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { saveTripTransaction } from './save-trip-transaction.mjs';
import { recordPayment as pay, setTripState as state, travelAnalytics as analytics } from './travel-operations.mjs';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (projectId !== 'mydesckpro') throw Error('PRODUCTION_FUNCTION_PROJECT_MISMATCH');
const app = initializeApp({ projectId });
const deps = { db: getFirestore(app, 'default'), Timestamp };
const options = {
  enforceAppCheck: true,
  timeoutSeconds: 60,
  memory: '512MiB',
  maxInstances: 20,
  serviceAccount: 'mydesck-functions@mydesckpro.iam.gserviceaccount.com',
};

const callable = (operation) => onCall(options, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  try { return await operation(deps, request); }
  catch (error) {
    const code = /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'OPERATION_REJECTED';
    throw new HttpsError('failed-precondition', code);
  }
});

export const saveTrip = callable(saveTripTransaction);
export const recordPayment = callable((runtime, request) => pay(runtime, request));
export const recordInstallmentPayment = callable((runtime, request) => pay(runtime, request, true));
export const setTripState = callable(state);
export const travelAnalytics = callable(analytics);
