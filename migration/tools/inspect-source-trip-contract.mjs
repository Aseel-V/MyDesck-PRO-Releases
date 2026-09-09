import { localConfig,withSourceSnapshot } from './lib/staging-source.mjs';
import { writeReport } from './lib/write-report.mjs';
const report={generatedAt:new Date().toISOString(),sourceSafety:{}};
await withSourceSnapshot(localConfig(),async select=>{
  report.constraints=(await select(`SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.conrelid IN ('public.trips'::regclass,'public.trip_payment_plans'::regclass) AND c.contype='c' ORDER BY c.conname`)).rows;
},report.sourceSafety);
writeReport('migration/reports/source-trip-contract.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
