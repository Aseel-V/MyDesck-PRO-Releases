import { createHash } from 'node:crypto';
import { z } from 'zod';
import { validate } from '../lib/schemas.mjs';
import { moneyFromMinorUnits, decimalStringToScaledInteger, toStoredExact } from '../lib/exact-decimal.mjs';
import { TransactionError } from './save-trip-transaction.mjs';

const sumExactMoney = (values, currency) => { const scale=Math.max(...values.map(v=>v.scale)); if(values.some(v=>v.currency&&v.currency!==currency)) throw Error('CURRENCY_MISMATCH'); return toStoredExact(values.reduce((a,v)=>a+BigInt(v.unitsText)*10n**BigInt(scale-v.scale),0n),scale,{currency}); };
const fail = (code) => { throw new TransactionError(code); };
const uuid = z.string().uuid();
const paymentInput = z.object({ clientRequestId: uuid, tripId: uuid, currency: z.string().regex(/^[A-Z]{3}$/), amount: z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/), installmentId: uuid.optional(), expectedRevision: z.number().int().nonnegative().optional() }).strict();
const stateInput = z.object({ clientRequestId: uuid, tripId: uuid, state: z.enum(['archive','restore','delete','unarchive']) }).strict();
const safe = (n) => { if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)) fail('AMOUNT_OUT_OF_RANGE'); return Number(n); };
const integer = (n) => { if(!Number.isSafeInteger(n)) fail('UNSAFE_STORED_AMOUNT'); return BigInt(n); };

export async function authorizedBusiness(db, tx, uid) {
  if(!uid) fail('USER_NOT_AUTHENTICATED');
  const user = await tx.get(db.collection('users').doc(uid));
  if(!user.exists || user.data().isSuspended) fail('USER_ACCESS_DENIED');
  const result = await tx.get(db.collection('businesses').where('ownerUid','==',uid).limit(2));
  if(result.size!==1 || result.docs[0].data().isSuspended) fail('BUSINESS_ACCESS_DENIED');
  const businessId=result.docs[0].id;
  if(user.data().businessId && user.data().businessId!==businessId) fail('BUSINESS_ACCESS_DENIED');
  return businessId;
}

export async function recordPayment(deps, call, installment = false) {
  const uid=call?.auth?.uid; if(!uid) fail('USER_NOT_AUTHENTICATED');
  const input=validate(paymentInput,call.data,'INVALID_PAYMENT_INPUT');
  if(installment!==Boolean(input.installmentId)) fail('INSTALLMENT_ID_REQUIRED');
  const amount=decimalStringToScaledInteger(input.amount,2);
  if(amount<=0n) fail('INVALID_PAYMENT_AMOUNT'); safe(amount);
  const operation=installment?'installment':'cash';
  const fingerprint=createHash('sha256').update(JSON.stringify({operation,...input})).digest('hex');
  const key=`${uid}__${input.clientRequestId}`;
  const {db,Timestamp}=deps; const now=deps.now??new Date();
  return db.runTransaction(async tx=>{
    const businessId=await authorizedBusiness(db,tx,uid);
    const ledgerRef=db.collection('idempotency').doc(key), ledger=await tx.get(ledgerRef);
    if(ledger.exists) { if(ledger.data().fingerprint!==fingerprint) fail('IDEMPOTENCY_CONFLICT'); return {...ledger.data().responsePayload,idempotentReplay:true}; }
    const tripRef=db.collection('trips').doc(input.tripId), tripSnap=await tx.get(tripRef),trip=tripSnap.data();
    if(!trip||trip.ownerUid!==uid||trip.businessId!==businessId||trip.isDeleted) fail('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
    if(trip.currency!==input.currency) fail('CURRENCY_MISMATCH');
    if(input.expectedRevision!==undefined && input.expectedRevision!==(trip.revision??0)) fail('STALE_REVISION');
    const plans=await tx.get(db.collection('tripPaymentPlans').where('ownerUid','==',uid).where('tripId','==',input.tripId).where('status','==','active').limit(2));
    if(plans.size!==1) fail('ACTIVE_PLAN_REQUIRED');
    const planDoc=plans.docs[0], plan=planDoc.data();
    if(plan.currency!==input.currency||plan.businessId!==businessId) fail('CURRENCY_MISMATCH');
    const installments=await tx.get(db.collection('tripInstallments').where('ownerUid','==',uid).where('paymentPlanId','==',planDoc.id));
    const target=input.installmentId?installments.docs.find(d=>d.id===input.installmentId):null;
    if(installment && (!target||target.data().status==='cancelled')) fail('INSTALLMENT_NOT_FOUND');
    const oldCash=integer(plan.cashPaidMinor),card=installments.docs.filter(d=>d.data().status!=='cancelled').reduce((sum,d)=>sum+integer(d.data().paidAmountMinor),0n);
    const remaining=installment?integer(target.data().expectedAmountMinor)-integer(target.data().paidAmountMinor):integer(plan.cashTotalMinor)-oldCash;
    if(amount>remaining) fail('PAYMENT_EXCEEDS_REMAINING');
    const cashPaid=oldCash+(installment?0n:amount),cardPaid=card+(installment?amount:0n),paid=cashPaid+cardPaid;
    const total=integer(plan.cashTotalMinor)+integer(plan.cardTotalMinor);
    const stamp=Timestamp.fromDate(now),micros=String(BigInt(now.getTime())*1000n),sequence=Math.max(trip.eventSequence??0,now.getTime())+1;
    const money=(units)=>moneyFromMinorUnits(String(units),{currency:input.currency,scale:2});
    const event={schemaVersion:1,ownerUid:uid,userId:uid,actorUserId:uid,businessId,tripId:input.tripId,paymentPlanId:planDoc.id,sequence,isDeleted:false,createdAt:stamp,createdAtMicros:micros,amountMinor:safe(amount),amount:money(amount),currency:input.currency,eventType:operation,clientRequestId:input.clientRequestId,paymentEventId:key,...(installment?{installmentId:input.installmentId}:{})};
    const response={tripId:input.tripId,eventId:key,amountPaid:money(paid),amountDue:money(total-paid),revision:(trip.revision??0)+1};
    tx.update(planDoc.ref,{cashPaidMinor:safe(cashPaid),cardPaidMinor:safe(cardPaid),updatedAt:stamp,updatedAtMicros:micros});
    if(target){const newPaid=integer(target.data().paidAmountMinor)+amount;tx.update(target.ref,{paidAmountMinor:safe(newPaid),status:newPaid===integer(target.data().expectedAmountMinor)?'paid':'partial',paidAt:stamp,updatedAt:stamp,updatedAtMicros:micros});}
    tx.update(tripRef,{amountPaid:response.amountPaid,amountDue:response.amountDue,paymentStatus:paid===total?'paid':'partial',revision:response.revision,eventSequence:sequence,updatedAt:stamp,updatedAtMicros:micros});
    tx.create(db.collection('tripPaymentEvents').doc(key),event);
    if(installment) tx.create(db.collection('tripInstallmentEvents').doc(key),event);
    tx.create(db.collection('tripFinancialAudit').doc(key),{...event,changedField:'amountPaid',operationType:'payment',before:trip.amountPaid,after:response.amountPaid});
    tx.create(db.collection('tripActivityLog').doc(key),{...event,activityType:'payment_recorded'});
    tx.create(ledgerRef,{schemaVersion:1,ownerUid:uid,userId:uid,businessId,tripId:input.tripId,isDeleted:false,clientRequestId:input.clientRequestId,fingerprint,responsePayload:response,createdAt:stamp,createdAtMicros:micros});
    return {...response,idempotentReplay:false};
  });
}

export async function setTripState(deps,call){
  const uid=call?.auth?.uid; if(!uid) fail('USER_NOT_AUTHENTICATED');
  const input=validate(stateInput,call.data,'INVALID_STATE_INPUT');
  const {db,Timestamp}=deps,now=deps.now??new Date(),key=`${uid}__${input.clientRequestId}`;
  return db.runTransaction(async tx=>{
    const businessId=await authorizedBusiness(db,tx,uid);
    const ledgerRef=db.collection('idempotency').doc(key),old=await tx.get(ledgerRef);
    if(old.exists){if(old.data().operation!==input.state||old.data().tripId!==input.tripId) fail('IDEMPOTENCY_CONFLICT');return old.data().responsePayload;}
    const ref=db.collection('trips').doc(input.tripId),snap=await tx.get(ref),trip=snap.data();
    if(!trip||trip.ownerUid!==uid||trip.businessId!==businessId)fail('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
    const stamp=Timestamp.fromDate(now),micros=String(BigInt(now.getTime())*1000n);
    const patch={revision:(trip.revision??0)+1,updatedAt:stamp,updatedAtMicros:micros};
    if(input.state==='delete'||input.state==='restore'){patch.isDeleted=input.state==='delete';patch.deletedAt=patch.isDeleted?stamp:null;patch.deletedAtMicros=patch.isDeleted?micros:null;patch.deletedBy=patch.isDeleted?uid:null;}
    else {if(trip.isDeleted)fail('TRIP_IS_DELETED');patch.status=input.state==='archive'?'archived':'active';}
    const result={id:input.tripId};tx.update(ref,patch);
    tx.create(db.collection('tripActivityLog').doc(key),{schemaVersion:1,ownerUid:uid,userId:uid,actorUserId:uid,businessId,tripId:input.tripId,isDeleted:false,activityType:input.state,sequence:now.getTime(),createdAt:stamp,createdAtMicros:micros});
    tx.create(ledgerRef,{schemaVersion:1,ownerUid:uid,businessId,tripId:input.tripId,operation:input.state,responsePayload:result});return result;
  });
}

// Server-side bounded aggregation. No client scan, no cross-currency totals.
// Reject datasets larger than the current rehearsal bound instead of truncating.
export async function travelAnalytics(deps,call){
  const uid=call?.auth?.uid;if(!uid)fail('USER_NOT_AUTHENTICATED');
  return deps.db.runTransaction(async tx=>{
    const businessId=await authorizedBusiness(deps.db,tx,uid);
    const rows=await tx.get(deps.db.collection('trips').where('ownerUid','==',uid).where('businessId','==',businessId).where('isDeleted','==',false).limit(1001));
    if(rows.size>1000)fail('ANALYTICS_MATERIALIZATION_REQUIRED');
    const currencies={};
    for(const d of rows.docs){const t=d.data(),c=t.currency; currencies[c]??={tripCount:0,salePrice:[],wholesaleCost:[],amountPaid:[]};const g=currencies[c];g.tripCount++;for(const f of ['salePrice','wholesaleCost','amountPaid'])g[f].push(t[f]);}
    for(const [c,g] of Object.entries(currencies)){for(const f of ['salePrice','wholesaleCost','amountPaid'])g[f]=sumExactMoney(g[f],c); const subtract=(a,b)=>sumExactMoney([a,{...b,unitsText:String(-BigInt(b.unitsText)),units:null,decimal:undefined}],c);g.margin=subtract(g.salePrice,g.wholesaleCost);g.receivable=subtract(g.salePrice,g.amountPaid);g.currency=c;}
    return currencies;
  });
}
