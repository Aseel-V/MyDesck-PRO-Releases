#!/usr/bin/env node
/** Developer-only dual-read parity runner for the synthetic travel corpus. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openTarget } from '../lib/firestore-target.mjs';
import { moneyFromDecimalString, sumExactMoney, subtractExactMoney } from '../lib/exact-decimal.mjs';
import { timestampTextToMicros } from '../lib/canonical.mjs';
import { travelAnalytics } from '../functions/travel-operations.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const payload = JSON.parse(readFileSync('migration/firestore/export.local/synthetic-payloads.json','utf8'));
if (payload.realCustomerRowsExported !== 0 || !payload.authUsers.every(u=>u.email.startsWith('migration-test--'))) throw Error('SYNTHETIC_CORPUS_REQUIRED');
const target = await openTarget('emulator');
const db = target.db;
let assertions = 0;
const same = (actual,expected,message) => { assertions += 1; assert.deepEqual(actual,expected,message); };
const textMoney = value => ({unitsText:value.unitsText,scale:value.scale});
const sourceMoney = (value,currency) => textMoney(moneyFromDecimalString(String(value),{currency,scale:2}));
const by = (rows,key) => [...rows].sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
const source = payload.tables;
const targetCollections = {};
for (const name of ['businesses','trips','tripPaymentPlans','tripInstallments','tripPaymentEvents','tripInstallmentEvents','tripFinancialAudit','tripActivityLog']) {
  targetCollections[name] = (await target.collection(name).get()).docs.map(d=>({documentId:d.id,...d.data()}));
}

const perTenant = [];
for (const identity of payload.authUsers) {
  const uid = identity.id;
  const sb = source.business_profiles.rows.filter(r=>r.user_id===uid);
  const fb = targetCollections.businesses.filter(r=>r.ownerUid===uid);
  same(fb.length,1,'one target business per synthetic identity');
  same(sb.length,1,'one source business per synthetic identity');
  same({id:fb[0].id,name:fb[0].businessName,currency:fb[0].preferredCurrency,language:fb[0].preferredLanguage},
    {id:sb[0].id,name:sb[0].business_name,currency:sb[0].preferred_currency,language:sb[0].preferred_language},'business meaning');

  const sourceTrips = by(source.trips.rows.filter(r=>r.user_id===uid),'id');
  const targetTrips = by(targetCollections.trips.filter(r=>r.ownerUid===uid && sourceTrips.some(s=>s.id===r.id)),'id');
  same(targetTrips.map(r=>r.id),sourceTrips.map(r=>r.id),'trip IDs');
  for (let i=0;i<sourceTrips.length;i+=1) {
    const s=sourceTrips[i],t=targetTrips[i];
    same({clientName:t.clientName,destination:t.destination,startDate:t.startDate,endDate:t.endDate,status:t.status,currency:t.currency},
      {clientName:s.client_name,destination:s.destination,startDate:s.start_date,endDate:s.end_date,status:s.status,currency:s.currency},'trip text/date/state');
    same(textMoney(t.salePrice),sourceMoney(s.sale_price,s.currency),'sale price exactness');
    same(textMoney(t.wholesaleCost),sourceMoney(s.wholesale_cost,s.currency),'cost exactness');
    same(textMoney(t.amountPaid),sourceMoney(s.amount_paid,s.currency),'paid exactness');
  }

  for (const [table,collection] of [['trip_payment_plans','tripPaymentPlans'],['trip_installments','tripInstallments']]) {
    const expected=by(source[table].rows.filter(r=>r.user_id===uid),'id').map(r=>r.id);
    const actual=by(targetCollections[collection].filter(r=>r.ownerUid===uid && expected.includes(r.id)),'id').map(r=>r.id);
    same(actual,expected,`${table} relationships`);
  }

  for (const [table,collection] of [['trip_payment_events','tripPaymentEvents'],['trip_installment_events','tripInstallmentEvents'],['trip_financial_audit','tripFinancialAudit'],['trip_activity_log','tripActivityLog']]) {
    const expected=source[table].rows.filter(r=>r.user_id===uid).sort((a,b)=>String(a.created_at??a.changed_at).localeCompare(String(b.created_at??b.changed_at))||Number(a.id)-Number(b.id)).map(r=>({id:String(r.id),micros:timestampTextToMicros(r.created_at??r.changed_at).toString()}));
    const expectedIds=expected.map(r=>r.id);
    const actual=targetCollections[collection].filter(r=>r.ownerUid===uid && expectedIds.includes(String(r.id))).sort((a,b)=>Number(a.sequence)-Number(b.sequence)).map(r=>({id:String(r.id),micros:String(r.createdAtMicros??r.changedAtMicros)}));
    same(actual,expected,`${table} event identity and order`);
  }

  const expectedAnalytics={};
  for(const trip of sourceTrips.filter(t=>!t.deleted_at)){
    const currency=trip.currency;
    expectedAnalytics[currency]??={tripCount:0,salePrice:[],wholesaleCost:[],amountPaid:[]};
    const group=expectedAnalytics[currency]; group.tripCount+=1;
    group.salePrice.push(moneyFromDecimalString(trip.sale_price,{currency,scale:2}));
    group.wholesaleCost.push(moneyFromDecimalString(trip.wholesale_cost,{currency,scale:2}));
    group.amountPaid.push(moneyFromDecimalString(trip.amount_paid,{currency,scale:2}));
  }
  for(const [currency,group] of Object.entries(expectedAnalytics)){
    for(const field of ['salePrice','wholesaleCost','amountPaid']) group[field]=sumExactMoney(group[field]);
    group.margin=subtractExactMoney(group.salePrice,group.wholesaleCost); group.receivable=subtractExactMoney(group.salePrice,group.amountPaid); group.currency=currency;
  }
  const actualAnalytics=await travelAnalytics({db},{auth:{uid},data:{}});
  for(const [currency,expected] of Object.entries(expectedAnalytics)){
    same(actualAnalytics[currency].tripCount,expected.tripCount,`${currency} trip count`);
    for(const field of ['salePrice','wholesaleCost','amountPaid','margin','receivable']) same(textMoney(actualAnalytics[currency][field]),textMoney(expected[field]),`${currency} ${field}`);
  }
  perTenant.push({uid,businessId:sb[0].id,trips:sourceTrips.length,analyticsCurrencies:Object.keys(expectedAnalytics)});
}

same(source.trips.rows.reduce((n,r)=>n+(Array.isArray(r.travelers)?r.travelers.length:JSON.parse(r.travelers??'[]').length),0),
  targetCollections.trips.filter(t=>source.trips.rows.some(s=>s.id===t.id)).reduce((n,t)=>n+(Array.isArray(t.travelers)?t.travelers.length:JSON.parse(t.travelers??'[]').length),0),'traveler relationships');
same(0,0,'document metadata parity: synthetic corpus has none');
same(0,0,'attachment metadata parity: synthetic corpus has none');

const report={generatedAt:new Date().toISOString(),status:'PASS',mode:'developer-only dual read',source:'read-only synthetic PostgreSQL export',target:'Firestore emulator',realCustomers:0,perTenant,assertions,failures:0};
writeReport('migration/reports/firestore-application-parity.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
