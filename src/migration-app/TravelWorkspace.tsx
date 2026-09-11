import { useEffect, useState } from 'react';
import type { AuthRepository, TravelRepositories, Trip, Cursor, SaveTrip } from '../data/contracts';
import { TripService } from '../data/TripService';
import { moneyText } from '../data/schemas';

const labels = {
  en: { title:'Travel', login:'Sign in', logout:'Sign out', next:'Next', save:'Save', pay:'Record payment', pending:'Waiting for server', confirmed:'Confirmed', search:'Search this page', create:'New trip' },
  he: { title:'נסיעות', login:'כניסה', logout:'יציאה', next:'הבא', save:'שמירה', pay:'רישום תשלום', pending:'ממתין לאישור שרת', confirmed:'אושר', search:'חיפוש בעמוד', create:'נסיעה חדשה' },
  ar: { title:'السفر', login:'دخول', logout:'خروج', next:'التالي', save:'حفظ', pay:'تسجيل دفعة', pending:'بانتظار تأكيد الخادم', confirmed:'تم التأكيد', search:'بحث في الصفحة', create:'رحلة جديدة' },
};
export function TravelWorkspace({repository}:{repository:TravelRepositories&AuthRepository}) {
  const [language,setLanguage]=useState<'en'|'he'|'ar'>('en'),[identity,setIdentity]=useState<string|null>(null);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[business,setBusiness]=useState('');
  const [trips,setTrips]=useState<Trip[]>([]),[next,setNext]=useState<Cursor>(),[search,setSearch]=useState('');
  const [details,setDetails]=useState<Awaited<ReturnType<TripService['details']>>>();
  const [status,setStatus]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [analytics,setAnalytics]=useState<unknown>();
  const [amount,setAmount]=useState('1.01'),[installmentId,setInstallmentId]=useState(''),[filter,setFilter]=useState('');
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [editor,setEditor]=useState<SaveTrip>();
  const text=labels[language],service=new TripService(repository);
  const run=async(operation:()=>Promise<void>)=>{setError('');setPending(true);setStatus(text.pending);try{await operation();setStatus(text.confirmed);}catch(error){console.error('Travel operation failed',error instanceof Error?error.message:'UNKNOWN');setError('Operation failed. No server confirmation.');setStatus('');}finally{setPending(false);}};
  const load=async(cursor?:Cursor)=>{const result=await service.list({pageSize:2,cursor,status:filter&&filter!=='deleted'?filter:undefined,deleted:filter==='deleted',from:from||undefined,to:to||undefined});setTrips(result.items);setNext(result.next);};
  const signedIn=async()=>{const current=await repository.currentIdentity();setIdentity(current?.uid??null);if(current){setBusiness((await repository.getCurrentBusiness()).businessName);await load();}};
  // The repository is fixed by the composition root; initialization intentionally runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{void run(signedIn);},[]);
  const open=async(id:string)=>{setDetails(await service.details(id));setInstallmentId('');};
  const minor=(v:Trip['salePrice'])=>{const n=BigInt(v.unitsText);const scale=v.scale;const denominator=10n**BigInt(Math.max(scale-2,0));if(n%denominator)throw Error('OVER_PRECISION');const result=scale>2?n/denominator:n*10n**BigInt(2-scale);if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('OUT_OF_RANGE');return Number(result);};
  const edit=(trip?:Trip)=>setEditor({clientRequestId:crypto.randomUUID(),trip:trip?{id:trip.id,clientName:trip.clientName,destination:trip.destination,startDate:trip.startDate,endDate:trip.endDate,currency:trip.currency,travelersCount:details?.travelers.length??0,travelers:details?.travelers,salePriceMinor:minor(trip.salePrice),wholesaleCostMinor:minor(trip.wholesaleCost)}:{clientName:'migration-test-- Client',destination:'Paris / פריז / باريس',startDate:'2026-12-01',endDate:'2026-12-08',currency:'ILS',travelersCount:2,travelers:[{name:'נוסע / مسافر / Traveler'}],salePriceMinor:123457,wholesaleCostMinor:98713},...(!trip?{paymentPlan:{method:'mixed',cardTotalMinor:100001,cashTotalMinor:23456,confirmedCashMinor:0,installmentCount:3,firstDate:'2026-12-01'}}:{})});
  return <main dir={language==='en'?'ltr':'rtl'} lang={language} style={{maxWidth:1100,margin:'auto',padding:24,fontFamily:'sans-serif'}}>
    <header><h1>{text.title}</h1><select aria-label="Language" value={language} onChange={e=>setLanguage(e.target.value as typeof language)}><option value="en">English</option><option value="he">עברית</option><option value="ar">العربية</option></select></header>
    <p role="status">{status}</p>{error&&<p role="alert">{error}</p>}
    {!identity?<form onSubmit={e=>{e.preventDefault();void run(async()=>{await repository.login(email,password);setPassword('');await signedIn();});}}><input aria-label="Email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/><input aria-label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/><button disabled={pending}>{text.login}</button></form>:<>
      <h2>{business}</h2><button onClick={()=>void run(async()=>{await repository.logout();setIdentity(null);setTrips([]);setDetails(undefined);setEditor(undefined);})}>{text.logout}</button>
      <nav><button disabled={pending} onClick={()=>edit()}>{text.create}</button><select aria-label="Status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All</option><option value="active">Active</option><option value="archived">Archived</option><option value="deleted">Deleted</option></select><input aria-label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/><button onClick={()=>void run(()=>load())}>Apply</button><input aria-label="Search" placeholder={text.search} value={search} onChange={e=>setSearch(e.target.value)}/></nav>
      <ul>{trips.filter(t=>`${t.clientName} ${t.destination}`.toLowerCase().includes(search.toLowerCase())).map(trip=><li key={trip.id}><button data-trip-id={trip.id} onClick={()=>void run(()=>open(trip.id))}>{trip.clientName} — {trip.destination}</button> {moneyText(trip.salePrice)} {trip.currency}</li>)}</ul>
      <button disabled={!next||pending} onClick={()=>void run(()=>load(next))}>{text.next}</button>
      {details&&<section aria-label="Trip details"><h3>{details.trip.clientName}</h3><p>{details.trip.startDate} — {details.trip.endDate}</p><p>Sale: {moneyText(details.trip.salePrice)}; Cost: {moneyText(details.trip.wholesaleCost)}; Paid: {moneyText(details.trip.amountPaid)}</p><p>Travelers: {details.travelers.length}; Installments: {details.installments.length}; Events: {details.events.length}; Audit: {details.audit.length}; Documents: {details.documents.length}; Attachments: {details.attachments.length}</p><button disabled={pending} onClick={()=>edit(details.trip)}>Edit</button><select aria-label="Payment destination" value={installmentId} onChange={e=>setInstallmentId(e.target.value)}><option value="">Cash</option>{details.installments.filter(i=>i.status!=='cancelled').map(i=><option key={i.id} value={i.id}>{i.dueDate} ({i.status})</option>)}</select><input aria-label="Payment amount" value={amount} onChange={e=>setAmount(e.target.value)}/><button disabled={pending} onClick={()=>void run(async()=>{await service.pay({tripId:details.trip.id,clientRequestId:crypto.randomUUID(),currency:details.trip.currency,amount,...(installmentId?{installmentId}:{})});await open(details.trip.id);await load();})}>{text.pay}</button>{(['archive','unarchive','delete','restore'] as const).map(state=><button disabled={pending} key={state} onClick={()=>void run(async()=>{await repository.setTripState(details.trip.id,state,crypto.randomUUID());await open(details.trip.id);await load();})}>{state}</button>)}</section>}
      {editor&&<form aria-label="Trip editor" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await service.save(editor);setEditor(undefined);await load();await open(result.id);});}}><input aria-label="Client name" value={editor.trip.clientName} onChange={e=>setEditor({...editor,trip:{...editor.trip,clientName:e.target.value}})}/><input aria-label="Destination" value={editor.trip.destination} onChange={e=>setEditor({...editor,trip:{...editor.trip,destination:e.target.value}})}/><button disabled={pending}>{text.save}</button></form>}
      <button disabled={pending} onClick={()=>void run(async()=>setAnalytics(await repository.getTravelAnalytics()))}>Analytics</button>
      {analytics&&<pre aria-label="Travel analytics">{JSON.stringify(analytics,null,2)}</pre>}
    </>}
  </main>;
}
