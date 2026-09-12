import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, documentId, type QueryConstraint } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getBlob, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseClient } from './firebaseClient';
import type { AuthRepository, TravelRepositories, StorageRepository, TripFilter, TripPage, SaveTrip, PaymentCommand } from './contracts';
import { businessSchema, userSchema, tripSchema, installmentSchema, planSchema, eventSchema, auditEventSchema, metadataSchema, travelerSchema } from './schemas';
import { assertWriteAllowed } from './maintenanceMode';

export class FirestoreTravelRepository implements TravelRepositories, AuthRepository, StorageRepository {
  constructor(private readonly client: FirebaseClient) {}
  async currentIdentity() { await this.client.ready; await this.client.auth.authStateReady(); const u=this.client.auth.currentUser; if (!u) return null; if (this.client.mode==='firestore-emulator'&&!u.email?.startsWith('migration-test--')) { await this.logout(); throw Error('SYNTHETIC_IDENTITY_REQUIRED'); } return { uid:u.uid, email:u.email??'' }; }
  async login(email:string,password:string) { if(this.client.mode==='firestore-emulator'&&!email.startsWith('migration-test--')) throw Error('SYNTHETIC_IDENTITY_REQUIRED'); await this.client.ready; await signInWithEmailAndPassword(this.client.auth,email,password); return (await this.currentIdentity())!; }
  async logout() { await signOut(this.client.auth); }
  async refreshToken() { if(!await this.currentIdentity()) throw Error('UNAUTHENTICATED'); await this.client.auth.currentUser!.getIdToken(true); }
  private async scope() {
    const identity=await this.currentIdentity(); if(!identity) throw Error('UNAUTHENTICATED');
    const user=userSchema.parse((await getDoc(doc(this.client.db,'users',identity.uid))).data());
    if(user.isSuspended) throw Error('USER_SUSPENDED');
    const businesses=await getDocs(query(collection(this.client.db,'businesses'),where('ownerUid','==',identity.uid),limit(2)));
    if(businesses.size!==1) throw Error('BUSINESS_NOT_UNIQUE');
    const business=businessSchema.parse(businesses.docs[0].data());
    if(business.isSuspended || (user.businessId && user.businessId!==business.id)) throw Error('BUSINESS_ACCESS_DENIED');
    return {uid:identity.uid,business};
  }
  async getCurrentBusiness() { return (await this.scope()).business; }
  async listTripsForBusiness(filter:TripFilter={}):Promise<TripPage> {
    const {uid,business}=await this.scope(); const size=filter.pageSize??24;
    if(!Number.isInteger(size)||size<1||size>100) throw Error('INVALID_PAGE_SIZE');
    const scope=JSON.stringify([uid,business.id,filter.status,filter.from,filter.to,!!filter.deleted]);
    if(filter.cursor && filter.cursor.scope!==scope) throw Error('CURSOR_SCOPE_MISMATCH');
    const constraints:QueryConstraint[]=[where('ownerUid','==',uid),where('businessId','==',business.id),where('isDeleted','==',!!filter.deleted)];
    if(filter.status) constraints.push(where('status','==',filter.status));
    if(filter.from) constraints.push(where('startDate','>=',filter.from));
    if(filter.to) constraints.push(where('startDate','<=',filter.to));
    constraints.push(orderBy('startDate'),orderBy(documentId()));
    if(filter.cursor) constraints.push(startAfter(filter.cursor.startDate,filter.cursor.id));
    const snapshot=await getDocs(query(collection(this.client.db,'trips'),...constraints,limit(size+1)));
    const items=snapshot.docs.slice(0,size).map(d=>tripSchema.parse(d.data()));
    const last=items[items.length - 1];
    return {items,...(snapshot.size>size&&last?{next:{id:last.id,startDate:last.startDate,scope}}:{})};
  }
  async getTripDetails(id:string) { const {uid,business}=await this.scope(); const value=tripSchema.parse((await getDoc(doc(this.client.db,'trips',id))).data()); if(value.ownerUid!==uid||value.businessId!==business.id) throw Error('TRIP_NOT_FOUND'); return value; }
  private async related(name:string,tripId:string) { const trip=await this.getTripDetails(tripId); const rows=await getDocs(query(collection(this.client.db,name),where('ownerUid','==',trip.ownerUid),where('businessId','==',trip.businessId),where('tripId','==',tripId),limit(500))); if(rows.size===500) throw Error('HISTORY_PAGINATION_REQUIRED'); return rows.docs.map(d=>d.data()); }
  async listTravelers(id:string) { const trip=await this.getTripDetails(id); const raw=typeof trip.travelers==='string'?JSON.parse(trip.travelers):trip.travelers; if(raw==null) return []; return travelerSchema.array().parse(raw); }
  async getPaymentPlans(id:string) { return (await this.related('tripPaymentPlans',id)).map(v=>planSchema.parse(v)); }
  async listInstallments(id:string) { return (await this.related('tripInstallments',id)).map(v=>installmentSchema.parse(v)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id)); }
  async listDueInstallments(through:string) { const {uid,business}=await this.scope(); const rows=await getDocs(query(collection(this.client.db,'tripInstallments'),where('ownerUid','==',uid),where('businessId','==',business.id),where('status','in',['scheduled','partial']),where('dueDate','<=',through),orderBy('dueDate'),limit(100))); return rows.docs.map(d=>installmentSchema.parse(d.data())); }
  async listFinancialEvents(id:string) { return (await Promise.all(['tripPaymentEvents','tripInstallmentEvents'].map(n=>this.related(n,id)))).flat().map(v=>eventSchema.parse(v)).sort((a,b)=>a.sequence-b.sequence); }
  async listAuditHistory(id:string) { return (await Promise.all(['tripFinancialAudit','tripActivityLog'].map(n=>this.related(n,id)))).flat().map(v=>auditEventSchema.parse(v)).sort((a,b)=>a.sequence-b.sequence); }
  async listAttachments(id:string) { const trip=await this.getTripDetails(id); const raw=typeof trip.attachments==='string'?JSON.parse(trip.attachments):trip.attachments; return metadataSchema.array().parse(raw??[]); }
  async listDocuments(id:string) { return (await this.listAttachments(id)).filter(v=>v.mime==='application/pdf'); }
  private async call<T>(name:string,data:unknown):Promise<T> { await this.scope(); if(typeof navigator!=='undefined'&&!navigator.onLine) throw Error('SERVER_CONFIRMATION_REQUIRED'); return (await httpsCallable<unknown,T>(this.client.functions,name)(data)).data; }
  async saveTrip(data:SaveTrip) { assertWriteAllowed(data.trip.id?'trip.edit':'trip.create',this.client.maintenanceEnabled); return this.call<{id:string}>('saveTrip',data); }
  async recordPayment(data:PaymentCommand) { assertWriteAllowed('payment.record',this.client.maintenanceEnabled); return this.call('recordPayment',data); }
  async recordInstallmentPayment(data:PaymentCommand&{installmentId:string}) { assertWriteAllowed('installment.record',this.client.maintenanceEnabled); return this.call('recordInstallmentPayment',data); }
  async setTripState(id:string,state:'archive'|'restore'|'delete'|'unarchive',clientRequestId:string) { assertWriteAllowed('trip.edit',this.client.maintenanceEnabled); await this.call('setTripState',{tripId:id,state,clientRequestId}); }
  async getTravelAnalytics() { return this.call('travelAnalytics',{}); }
  private async privatePath(path:string) { const {business}=await this.scope(); const prefix=`businesses/${business.id}/`; if(!path.startsWith(prefix)||path.includes('..')||path.includes('%')||!/^businesses\/[^/]+\/(signatures\/[^/]+|trips\/[^/]+\/attachments\/[^/]+)$/.test(path)) throw Error('PRIVATE_PATH_DENIED'); return path; }
  async readPrivateFile(path:string) { return getBlob(ref(this.client.storage,await this.privatePath(path)),25*1024*1024); }
  async uploadPrivateFile(path:string,file:Blob) { assertWriteAllowed('attachment.write',this.client.maintenanceEnabled); await uploadBytes(ref(this.client.storage,await this.privatePath(path)),file); return path; }
}
