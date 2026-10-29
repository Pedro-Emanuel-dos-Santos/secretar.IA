// LOCAL FIXTURES ONLY. No .env, Railway access or production credentials.
const h=require('./lib/beta-fixtures.cjs');
const {assert,p,fs,path,root,save,randomUUID,sha,createPrismaClient,databaseUrl}=h;
const {spawnSync}=require('node:child_process'),{Pool}=require('pg'),ts=require('typescript'),vm=require('node:vm');
const docker=process.env.BETA_DOCKER_EXE;if(!docker)throw Error('BETA_DOCKER_EXE required');
const pg='secretaria_m04_postgres_test',redis='secretaria_m04_redis_test';
function run(args,input,allowFailure=false){const r=spawnSync(docker,args,{input,encoding:null,maxBuffer:32*1024*1024,timeout:45000});if(r.error||r.status!==0&&!allowFailure)throw Error('Local Docker drill step failed: '+args.slice(0,3).join(' '));return r;}
function text(args){return run(args).stdout.toString().trim();}
function target(kind){const name='m04_'+kind+'_'+randomUUID().slice(0,8)+'_test';assert.match(name,/^m04_(restore|corrupt|compat)_[a-f0-9]{8}_test$/);return name;}
function createDatabase(name){run(['exec',pg,'createdb','-U','secretaria_test',name]);const u=new URL(databaseUrl);u.pathname='/'+name;return u.href;}
async function manifest(client){
 const tables=await client.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"),result={};
 for(const {tablename:name} of tables){assert.match(name,/^[A-Za-z_][A-Za-z0-9_]*$/);const rows=await client.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${name}" t ORDER BY to_jsonb(t)::text`);result[name]={count:rows.length,sha256:sha(rows)};}
 return result;
}
function historicalModule(file){const r=spawnSync('git',['show','a072f63353961ea6da0c5756417967a91248a317:backend/src/domain/'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});if(r.status!==0)throw Error('Historical baseline unavailable');const mod={exports:{}};vm.runInNewContext(ts.transpileModule(r.stdout,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,module:mod,require:()=>{throw Error('Unexpected baseline dependency');},Date,process:{env:{}}});return {exports:mod.exports,sha256:sha(r.stdout)};}
(async()=>{
 const started=Date.now(),e={kind:'local-fixture-recovery',productionRestored:false,capturedAt:new Date().toISOString()};
 try{
  for(const container of [pg,redis])assert.equal(text(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]),'secretaria-m04-test');
  e.postgresVersion=text(['exec',pg,'postgres','--version']);e.redisVersion=text(['exec',redis,'redis-server','--version']);
  const {Queue,Worker}=require('bullmq'),{createReminderProcessor}=require('../src/queue/reminder.processor.ts');
  const queue=new Queue('reminders',{connection:h.connection});let gateWorker,calls=0;
  try{
   await queue.pause();const processor=createReminderProcessor(p,h.load('state').account,()=>assert.fail('Maintenance gate must never send'));
   gateWorker=new Worker('reminders',async(job,token)=>{calls++;return processor(job,token);},{connection:h.connection});gateWorker.on('error',()=>{});
   const completed=new Promise(resolve=>gateWorker.once('completed',resolve));await queue.add('maintenance-fixture',{reminderId:'missing-fixture-'+randomUUID(),scheduleVersion:0});
   await new Promise(resolve=>setTimeout(resolve,250));assert.equal(calls,0);await queue.resume();let timer;try{await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Maintenance resume timeout')),5000);})]);}finally{clearTimeout(timer);}assert.equal(calls,1);
   e.rolloutGating={globalPausePreventsClaims:true,resumeProcessesOnce:true,missingReminderSkippedWithoutSend:true};
  }finally{if(gateWorker)await gateWorker.close();await queue.close();}
  const before=await manifest(p),archive=run(['exec',pg,'pg_dump','-U','secretaria_test','-d','secretaria_m04_test','--format=custom','--no-owner','--no-privileges']).stdout;
  assert.ok(archive.length>4096);fs.writeFileSync(path.join(root,'fictional-postgres.dump'),archive);
  const restoredName=target('restore'),restoredUrl=createDatabase(restoredName);run(['exec','-i',pg,'pg_restore','-U','secretaria_test','--dbname',restoredName,'--single-transaction','--no-owner','--no-privileges','--exit-on-error'],archive);
  const restored=createPrismaClient(restoredUrl);try{assert.deepEqual(await manifest(restored),before);}finally{await restored.$disconnect();}
  const corruptName=target('corrupt');createDatabase(corruptName);const corrupt=run(['exec','-i',pg,'pg_restore','-U','secretaria_test','--dbname',corruptName,'--single-transaction','--no-owner','--no-privileges','--exit-on-error'],archive.subarray(0,archive.length-4096),true);assert.notEqual(corrupt.status,0);
  const corruptTables=Number(text(['exec',pg,'psql','-U','secretaria_test','-d',corruptName,'-Atc',"SELECT count(*) FROM pg_tables WHERE schemaname='public'"]));assert.equal(corruptTables,0);
  e.postgres={archiveBytes:archive.length,archiveSha256:sha(archive),sourceDatabase:'secretaria_m04_test',restoreDatabase:restoredName,allTablesMatch:true,manifest:before,corruptArchiveRejected:true,corruptRestoreRolledBack:true,corruptDatabase:corruptName};
  const compatName=target('compat'),compatUrl=createDatabase(compatName),pool=new Pool({connectionString:compatUrl,max:1});
  try{
   const dir=path.join(__dirname,'..','prisma','migrations'),migrations=fs.readdirSync(dir).filter(x=>/^\d+_/.test(x)).sort();assert.equal(migrations.at(-1),'20261028180000_reliable_delivery_ai_usage');
   for(const m of migrations.slice(0,-1))await pool.query(fs.readFileSync(path.join(dir,m,'migration.sql'),'utf8'));
   await pool.query(`INSERT INTO "User" (id,phone,"updatedAt") VALUES ('legacy-fixture-user','5500000000001',now());INSERT INTO "Reminder" (id,"userId",title,"remindAt",status,"updatedAt") VALUES ('legacy-fixture-reminder','legacy-fixture-user','Fixture',now(),'delivery_unknown',now())`);
   const legacyBefore=(await pool.query('SELECT * FROM "Reminder"')).rows;
   await pool.query('BEGIN');await pool.query(fs.readFileSync(path.join(dir,migrations.at(-1),'migration.sql'),'utf8'));await pool.query('COMMIT');
   const after=(await pool.query('SELECT * FROM "Reminder"')).rows;const {deliveryAttempts,deliveryRetryAt,...legacyAfter}=after[0];assert.deepEqual(legacyAfter,legacyBefore[0]);assert.equal(deliveryAttempts,0);assert.equal(deliveryRetryAt,null);
   const compat=createPrismaClient(compatUrl);try{
    const r=await compat.reminder.create({data:{userId:'legacy-fixture-user',title:'Retry fixture',status:'delivery_retry',remindAt:new Date(),scheduleOutbox:{create:{phoneNumberId:'compat-fixture'}}}});
    const old=historicalModule('reminder.execution.ts'),current=require('../src/domain/reminder.execution.ts');assert.equal((await old.exports.prepareReminderExecution(compat,r.id,'compat-fixture',0)).kind,'skipped');assert.equal((await current.prepareReminderExecution(compat,r.id,'compat-fixture',0)).kind,'ready');
    const parser=historicalModule('interpretation.validation.ts');assert.throws(()=>parser.exports.parseInterpretation('{"action":"recall_context","reply":"Consulta"}'));assert.equal(require('../src/domain/interpretation.validation.ts').parseInterpretation('{"action":"recall_context","reply":"Consulta"}').action,'recall_context');
    e.compatibility={database:compatName,existingRowUnchanged:true,newDefaultsVerified:true,oldWorkerSkipsNewRetry:true,newWorkerAcceptsRetry:true,oldParserRejectsRecallContext:true,historicalSourceHashes:{execution:old.sha256,parser:parser.sha256},mixedVersionRolloutSafe:false};
   }finally{await compat.$disconnect();}
  }finally{await pool.end();}
  // RDB reload may change internal encodings (and therefore DUMP bytes) without
  // changing data. Compare canonical logical values, including order/scores/IDs.
  const digestScript="local a=redis.call('KEYS','bull:reminders:*');table.sort(a);local s='';local n=0;for _,k in ipairs(a) do if redis.call('PTTL',k)==-1 then local t=redis.call('TYPE',k).ok;local v;if t=='string' then v=redis.call('GET',k) elseif t=='list' then v=redis.call('LRANGE',k,0,-1) elseif t=='zset' then v=redis.call('ZRANGE',k,0,-1,'WITHSCORES') elseif t=='set' then v=redis.call('SMEMBERS',k);table.sort(v) elseif t=='stream' then v=redis.call('XRANGE',k,'-','+') elseif t=='hash' then local fields=redis.call('HKEYS',k);table.sort(fields);v={};for _,f in ipairs(fields) do table.insert(v,{f,redis.call('HGET',k,f)}) end else return redis.error_reply('Unsupported type') end;s=s..k..':'..t..':'..cjson.encode(v)..';';n=n+1 end end;return {n,redis.sha1hex(s)}";
  const digest=container=>text(['exec',container,'redis-cli','-n','15','--raw','EVAL',digestScript,'0']);
  const redisBefore=digest(redis);assert.ok(redisBefore);assert.equal(text(['exec',redis,'redis-cli','SAVE']),'OK');run(['cp',redis+':/data/dump.rdb',path.join(root,'fictional-redis.rdb')]);
  const checked=text(['exec',redis,'redis-check-rdb','/data/dump.rdb']);assert.match(checked,/Checksum OK|RDB looks OK/);
  run(['kill','--signal','KILL',redis]);run(['start',redis]);let restarted;for(let n=0;n<40;n++){const r=run(['exec',redis,'redis-cli','PING'],undefined,true);if(r.status===0&&r.stdout.toString().trim()==='PONG'){restarted=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(restarted);assert.equal(digest(redis),redisBefore);
  const restoreRedis='secretaria_m04_redis_restore_'+randomUUID().slice(0,8)+'_test';run(['create','--name',restoreRedis,'--network','none','redis:8.2','redis-server','--appendonly','no']);run(['cp',path.join(root,'fictional-redis.rdb'),restoreRedis+':/data/dump.rdb']);run(['start',restoreRedis]);
  let ready=false;for(let n=0;n<40;n++){const r=run(['exec',restoreRedis,'redis-cli','PING'],undefined,true);if(r.status===0&&r.stdout.toString().trim()==='PONG'){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready);assert.equal(digest(restoreRedis),redisBefore);
  e.redis={forcedRestartSurvived:true,rdbChecksumVerified:true,restoredIntoSeparateContainer:restoreRedis,restoreHasNoNetwork:true,persistentKeysAndLogicalDigestsMatch:true,digest:redisBefore,ttlMetadataExcluded:true,sourceAofEnabled:true,productionAofEnabled:false};
  e.elapsedMs=Date.now()-started;e.passed=true;save('recovery-drill',e);console.log(JSON.stringify({passed:true,postgresAllTablesMatch:true,corruptRejected:true,mixedVersionsSafe:false,redisRestartAndRestoreVerified:true,elapsedMs:e.elapsedMs}));
 }finally{await p.$disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
