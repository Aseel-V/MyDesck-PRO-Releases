import { randomBytes } from 'node:crypto';
import { cloud,PROJECT,INSTANCE,SQL_SA,gcloud,readPrivate,savePrivate } from './lib/cloud-control.mjs';
import { writeReport } from './lib/write-report.mjs';
const report={generatedAt:new Date().toISOString(),project:PROJECT,instance:INSTANCE,status:'BLOCKED',steps:[]};
const config=readPrivate();
try {
  const instances=await cloud(`https://sqladmin.googleapis.com/sql/v1beta4/projects/${PROJECT}/instances`);
  const existing=instances.items?.find(x=>x.name===INSTANCE);
  if(existing){
    if(existing.settings?.userLabels?.purpose!=='migration-proof')throw new Error('EXISTING_INSTANCE_NOT_OWNED_BY_PROOF');
    report.state=existing.state;report.operation=config.operation;report.status='EXISTING_STAGING_INSTANCE';
  }else{
    config.rootPassword??=randomBytes(32).toString('base64url');config.runtimePassword??=randomBytes(32).toString('base64url');
    config.migrationPassword??=randomBytes(32).toString('base64url');savePrivate(config);
    const op=await cloud(`https://sqladmin.googleapis.com/sql/v1beta4/projects/${PROJECT}/instances`,'POST',{
      name:INSTANCE,region:'me-west1',databaseVersion:'POSTGRES_17',rootPassword:config.rootPassword,
      settings:{tier:'db-f1-micro',edition:'ENTERPRISE',availabilityType:'ZONAL',dataDiskType:'PD_SSD',dataDiskSizeGb:'10',
        storageAutoResize:false,activationPolicy:'ALWAYS',connectorEnforcement:'REQUIRED',
        ipConfiguration:{ipv4Enabled:true,authorizedNetworks:[],sslMode:'ENCRYPTED_ONLY'},
        backupConfiguration:{enabled:false,pointInTimeRecoveryEnabled:false},
        userLabels:{purpose:'migration-proof',environment:'disposable-staging'},deletionProtectionEnabled:true}});
    config.operation=op.name;savePrivate(config);report.operation=op.name;report.status='PROVISIONING';
  }
  // Existing Firebase account is deliberately not reused for Cloud SQL.
  let account;
  try{account=await cloud(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SQL_SA}`);}
  catch(error){if(error.code!==404)throw error;account=await cloud(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`,'POST',{
    accountId:'mydesck-sql-staging',serviceAccount:{displayName:'Disposable MyDesck staging SQL connection only'}});}
  report.steps.push('separate_connection_service_account');
  const condition={title:'mydesck-staging-only',expression:`resource.name == 'projects/${PROJECT}/instances/${INSTANCE}' && resource.service == 'sqladmin.googleapis.com'`};
  const policy=await cloud(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,'POST',{options:{requestedPolicyVersion:3}});
  policy.version=3;policy.bindings??=[];
  let binding=policy.bindings.find(x=>x.role==='roles/cloudsql.client'&&x.condition?.expression===condition.expression);
  if(!binding){binding={role:'roles/cloudsql.client',condition,members:[]};policy.bindings.push(binding);}
  if(!binding.members.includes('serviceAccount:'+SQL_SA)){
    binding.members.push('serviceAccount:'+SQL_SA);
    await cloud(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`,'POST',{policy});
  }
  report.steps.push('instance_conditional_cloudsql_client');
  const operator=gcloud(['config','get-value','account']);
  const saPolicy=await cloud(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SQL_SA}:getIamPolicy`);
  saPolicy.bindings??=[];let tokenBinding=saPolicy.bindings.find(x=>x.role==='roles/iam.serviceAccountTokenCreator'&&!x.condition);
  if(!tokenBinding){tokenBinding={role:'roles/iam.serviceAccountTokenCreator',members:[]};saPolicy.bindings.push(tokenBinding);}
  if(!tokenBinding.members.includes('user:'+operator)){
    tokenBinding.members.push('user:'+operator);
    await cloud(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SQL_SA}:setIamPolicy`,'POST',{policy:saPolicy});
  }
  report.steps.push('operator_can_impersonate_connection_account');
}catch(error){report.blocker=error.message;report.errorCode=error.code??null;report.apiStatus=error.status??null;report.reason=error.reason;report.diagnostic=error.diagnostic;}
writeReport('migration/reports/cloud-staging-provision.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));process.exitCode=report.blocker?2:0;
