// Reproducible local validation; no real provider credentials reach the tests.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const flags=new Set(process.argv.slice(2));
for(const flag of flags)if(!['--integration','--migrate-test'].includes(flag))throw Error('Unknown flag: '+flag);
if(flags.has('--migrate-test')&&!flags.has('--integration'))throw Error('--migrate-test requires --integration');
const env={...process.env,WHATSAPP_ACCESS_TOKEN:'',OPENAI_API_KEY:'',AI_MODE:'openai'};
if(flags.has('--integration')){
 const value=env.INBOX_TEST_DATABASE_URL || env.DATABASE_URL;
 if(!value)throw Error('Configure a local database URL.');
 const target=new URL(value);
 if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('Integration accepts only local test databases.');
 if(!env.INBOX_TEST_DATABASE_URL)target.pathname='/secretaria_inbox_test';
 if(!target.pathname.endsWith('_test'))throw Error('Integration database must end in _test.');
 env.INBOX_TEST_DATABASE_URL=target.href;env.DATABASE_URL=target.href;env.DIRECT_DATABASE_URL=target.href;
}
function run(label,args){
 console.log('\n'+label);
 const result=spawnSync(process.execPath,args,{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit'});
 if(result.error){console.error('Could not start validation step.');process.exit(1);}
 if(result.status!==0)process.exit(result.status || 1);
}
if(flags.has('--migrate-test')){
 run('Generate Prisma client',['node_modules/prisma/build/index.js','generate']);
 run('Apply migrations to isolated local test DB',['node_modules/prisma/build/index.js','migrate','deploy']);
}
run('TypeScript',['node_modules/typescript/bin/tsc','--noEmit']);
run('Unit tests',['test/run.cjs']);
if(flags.has('--integration'))run('Local integration tests (simulated providers)',['test/integration.cjs']);
console.log('\nPilot checks passed. No deploy or real message was requested. AI interpretation still needs a separate provider evaluation.');
