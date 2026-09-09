import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
export const PROJECT='mydesckpro',INSTANCE='mydesck-migration-staging',SQL_SA='mydesck-sql-staging@mydesckpro.iam.gserviceaccount.com';
const sdk=join(process.env.LOCALAPPDATA,'Google/Cloud SDK/google-cloud-sdk');
export function gcloud(args){return execFileSync(join(sdk,'platform/bundledpython/python.exe'),[join(sdk,'lib/gcloud.py'),...args],
  {encoding:'utf8',maxBuffer:10_000_000,stdio:['ignore','pipe','pipe'],timeout:90000}).trim();}
export async function cloud(url,method='GET',body){
  const destination=new URL(url);
  if(destination.protocol!=='https:'||!['sqladmin','iam','cloudresourcemanager','serviceusage'].some(x=>destination.hostname===x+'.googleapis.com'))throw new Error('CLOUD_URL_REFUSED');
  const token=gcloud(['auth','print-access-token']);
  const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','x-goog-user-project':PROJECT},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error('GOOGLE_API_'+response.status),{code:response.status,status:data.error?.status,
    reason:data.error?.errors?.[0]?.reason,diagnostic:method==='GET'?data.error?.message:undefined});
  return data;
}
export const privateDirectory=join(process.env.LOCALAPPDATA,'MyDesckMigration/full-staging');
export const privateFile=join(privateDirectory,'connection.json');
export function readPrivate(){return existsSync(privateFile)?JSON.parse(readFileSync(privateFile,'utf8')):{};}
export function savePrivate(data){mkdirSync(privateDirectory,{recursive:true});writeFileSync(privateFile,JSON.stringify(data,null,2));}
