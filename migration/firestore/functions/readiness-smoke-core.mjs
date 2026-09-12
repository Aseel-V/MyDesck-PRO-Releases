import { randomUUID } from 'node:crypto';
import { hash } from '../lib/environment-readiness.mjs';

// Dedicated synthetic callable core: no arbitrary document paths or customer payloads.
export async function readinessSmoke({ db, Timestamp }, request) {
  const { migrationRunId, ...extra } = request.data ?? {};
  if (Object.keys(extra).length || !/^migration-test--production-readiness-[a-f0-9-]{36}$/.test(migrationRunId ?? '')) throw Error('SYNTHETIC_INPUT_REQUIRED');
  if (request.auth?.uid !== `${migrationRunId}--owner` || request.auth?.token?.migrationRunId !== migrationRunId ||
      request.auth?.token?.migrationReadiness !== true) throw Error('SYNTHETIC_IDENTITY_REQUIRED');
  if (!request.app?.appId) throw Error('APP_CHECK_REQUIRED');
  const root = db.collection('migration-test');
  const ids = ['business','trip','payment','journal','idempotency'].map(kind=>({kind,id:`${migrationRunId}--${kind}`}));
  const refs = Object.fromEntries(ids.map(({kind,id})=>[kind,root.doc(id)]));
  const creationReceipt = randomUUID();
  const result = await db.runTransaction(async tx => {
    const existing = await tx.get(refs.idempotency);
    if (existing.exists) {
      if (existing.data().migrationRunId !== migrationRunId || existing.data().ownerUid !== request.auth.uid) throw Error('SYNTHETIC_COLLISION');
      return { replay:true, ids, creationReceipt:existing.data().creationReceipt };
    }
    const common = { migrationRunId, ownerUid:request.auth.uid, synthetic:true, creationReceipt, createdAt:Timestamp.now() };
    const payment = { amount:'17.25', currency:'ILS', tripId:refs.trip.id };
    // create preconditions reject collisions atomically, including a preexisting synthetic ID.
    tx.create(refs.business,{...common,id:refs.business.id});
    tx.create(refs.trip,{...common,id:refs.trip.id,businessId:refs.business.id});
    tx.create(refs.payment,{...common,...payment,id:refs.payment.id});
    tx.create(refs.journal,{...common,beforeHash:null,afterHash:hash(JSON.stringify(payment)),operation:'SYNTHETIC_PAYMENT',targetPath:refs.payment.path});
    tx.create(refs.idempotency,{...common,ids});
    return { replay:false, ids, creationReceipt };
  });
  return { ...result, migrationRunId, backend:'supabase', customerWrites:0 };
}
