/** Assemble the BLOCKED execution record; never infer live parity from fixtures. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeReport } from './lib/write-report.mjs';
const read=name=>JSON.parse(readFileSync('migration/reports/'+name+'.json','utf8'));
const source=read('staging-source-inventory'), schema=read('staging-schema-plan');
const local=read('staging-local-validation'),controls=read('staging-postgres-controls'),preflight=read('staging-preflight');
const storage={generatedAt:new Date().toISOString(),status:'BLOCKED',copyAuthorized:false,
  objectRowsRead:0,objectsDiscovered:0,objectsCopied:0,objectsDownloaded:0,
  reason:'No business slice was exported; catalog candidates do not establish actual object references',
  requiredEntryFields:['sourceBucket','sourcePath','owner','business','trip','mimeType','size','privacyClassification'],
  privacyClasses:['PUBLIC','PRIVATE','SIGNATURE','TRIP_ATTACHMENT'],
  signatureRequirement:'PRIVATE; never manufacture a public URL',objects:[],
  candidateColumns:schema.columns.filter(x=>/attachment|signature|(?:^|_)image_url$|logo_url|photo_url|storage_path|bucket/.test(x.column_name))
    .map(x=>({table:x.table_name,column:x.column_name,type:x.type,status:'BLOCKED'})),
  checksumMismatches:null,unauthenticatedAccessTest:'BLOCKED',crossTenantAccessTest:'BLOCKED'};
writeReport('migration/reports/staging-storage-manifest.json',JSON.stringify(storage,null,2)+'\n');
const evidence={generatedAt:new Date().toISOString(),decision:'BLOCKED — FIX BEFORE FULL STAGING MIGRATION',
  startingCommit:preflight.startingCommit,recoveryTag:preflight.recoveryTag,
  implementationCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  source:{project:source.sourceProject,identityRowsReadAcrossAttempts:6,distinctSyntheticIdentities:3,
    businessPayloadRowsRead:0,realCustomerRowsExported:0,successfulWrites:0,rejectedWriteControls:3,
    failedInventoryAttempts:1,failedInventoryReason:'SELECT allowlist rejected privilege-name literal after reading 3 identities; corrected with a bound parameter',
    directSyntheticRows:source.syntheticDirectRows,readOnly:source.sourceSafety,
    independentCatalogReadOnly:schema.sourceSafety,globalAuditLogsInspected:false},
  cloud:{project:'mydesckpro',operatorInstanceListExitCode:0,instances:[],
    migrationServiceAccountInstanceList:'PERMISSION_DENIED',createdResources:0,
    database:null,version:null,encoding:null,productionAppConnected:false},
  importedProductionSliceRows:0,reconciliation:{status:'BLOCKED',tablesChecked:0,
    countMismatches:null,pkMismatches:null,contentMismatches:null,financialDelta:null,
    sourceOrphanBaseline:null,migrationOrphans:null,eventOrderingMismatches:null},
  entities:source.sliceUids.map(uid=>({user:uid,sourceIdentityRows:1,targetIdentityRows:null,
    businessRows:null,tripRows:null,financialTotals:null,eventCounts:null,documentCounts:null,
    attachmentReferenceCounts:null,status:'BLOCKED'})),
  schemaDifference:local.schemaDifference,
  localValidation:{status:local.status,migrations:local.replay.totalMigrations,
    migrationFailures:local.replay.summary.FAIL,baselineAssertions:local.assertions,
    offlineAssertions:local.newOfflineAssertions,postgresFixtureAssertions:controls.assertions,
    totalAssertions:local.totalAssertions+controls.assertions,
    failures:local.failures+local.newOfflineFailures+controls.failures,
    realCloudImportTested:false,temporaryFixturesRemoved:controls.temporaryTablesRemoved},
  storage:{status:storage.status,copied:0,checksumMismatches:null},
  production:{customerWrites:0,authChanges:0,applicationConfigChanges:0,cutover:false},
  unrelatedStagedPathsPreserved:preflight.unrelatedStagedPaths,
  blockers:['PREEXISTING_STAGED_GITHUB_TOKEN_CANDIDATE','EMPTY_SYNTHETIC_BUSINESS_SLICE',
    'SOURCE_REPLAY_SCHEMA_DRIFT','NO_CLOUD_SQL_TARGET','MIGRATION_ACCOUNT_CLOUD_SQL_ACCESS_DENIED',
    'LIVE_FK_CLOSURE_EXPORT_IMPORT_AND_RECONCILIATION_NOT_EXECUTED'],
};
writeReport('migration/reports/staging-data-migration-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({decision:evidence.decision,assertions:evidence.localValidation.totalAssertions,
  failures:evidence.localValidation.failures,definersWithoutSearchPath:local.replay.liveSchema.securityDefinerWithoutSearchPath.length}));
