import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readinessSmoke } from './readiness-smoke-core.mjs';

if ((process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT) !== 'mydesckpro') throw Error('READINESS_PROJECT_REFUSED');
const app=initializeApp({projectId:'mydesckpro'});
export const productionReadinessSmoke=onCall({region:'us-central1',enforceAppCheck:true,maxInstances:1,
  timeoutSeconds:60,memory:'256MiB',serviceAccount:'mydesck-functions@mydesckpro.iam.gserviceaccount.com'},async request=>{
  try { return await readinessSmoke({db:getFirestore(app,'default'),Timestamp},request); }
  catch { throw new HttpsError('failed-precondition','SYNTHETIC_READINESS_REFUSED'); }
});
