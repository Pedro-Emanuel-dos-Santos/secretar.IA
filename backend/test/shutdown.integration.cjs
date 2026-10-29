const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {fork,spawn}=require('node:child_process');
const path=require('node:path');
const http=require('node:http');
const {randomUUID,createHmac}=require('node:crypto');
const {Queue}=require('bullmq');
const databaseUrl=require('./integration.database.cjs');
const {createPrismaClient}=require('../dist/config/database.js');
const {persistReminder}=require('../dist/domain/reminder.creator.js');
const {receiveMessages}=require('../dist/domain/inbox.receiver.js');
if(process.env.NODE_ENV!=='test'||new URL(process.env.SHUTDOWN_TEST_REDIS_URL||'').hostname!=='redis-test')throw Error('isolated_fixture_required');
const prisma=createPrismaClient(databaseUrl), children=new Set(),accounts=[],users=[],queues=[];
const connection={host:'redis-test',port:6379,maxRetriesPerRequest:null};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
before(()=>prisma.$connect());
after(async()=>{
  for(const child of children)child.kill('SIGKILL');
  for(const q of queues){await q.obliterate({force:true});await q.close()}
  await prisma.event.deleteMany({where:{source:'fictional_sender'}});
  await prisma.user.deleteMany({where:{id:{in:users}}});
  await prisma.incomingMessage.deleteMany({where:{phoneNumberId:{in:accounts}}});
  await prisma.$disconnect();
});
function identity(){const account='shutdown-'+randomUUID();accounts.push(account);return {account,phone:'5597'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,10))).padStart(11,'0').slice(-11)}}
function child(mode, extra={}){
  const c=fork(path.join(__dirname,'shutdown.child.cjs'),[],{env:{...process.env,SHUTDOWN_FIXTURE_MODE:mode,...extra},stdio:['ignore','pipe','pipe','ipc']});
  children.add(c);c.events=[];c.on('message',m=>c.events.push(m));c.on('exit',()=>children.delete(c));
  c.exited=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));
  c.wait=async name=>{const end=Date.now()+15000;while(Date.now()<end){const found=c.events.find(e=>e.event===name);if(found)return found;if(c.exitCode!==null||c.signalCode)throw Error('fixture child exited before '+name);await delay(10)}throw Error('fixture timeout '+name)};
  return c;
}
function payload(i,id){return {object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:i.account},messages:[{id,from:i.phone,type:'text',text:{body:'Fictional shutdown request'}}]}}]}]}}
function post(port,body){const bytes=JSON.stringify(body);let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b});done.catch(()=>{});
 const request=http.request({host:'127.0.0.1',port,path:'/webhook',method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256','fictional_hmac_only').update(bytes).digest('hex')}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
 request.on('error',reject);request.end(bytes);return {request,done};}
async function source(i){return prisma.incomingMessage.create({data:{providerMessageId:randomUUID(),phoneNumberId:i.account,phone:i.phone,text:'Me lembra de Fictional shutdown reminder dia 20/07/2099 às 10h'}})}
async function reminderFixture(i){const s=await source(i);const r=await persistReminder({phone:i.phone,title:'Fictional reminder',remindAt:'2099-07-20T10:00:00-03:00'},prisma,{phoneNumberId:i.account,sourceMessageId:s.id});users.push(r.userId);await prisma.reminder.update({where:{id:r.id},data:{remindAt:new Date(Date.now()-500),status:'scheduled'}});return r}

for(const abortClient of [false,true])test('API SIGTERM drains persisted webhook; disconnected='+abortClient,{timeout:20000},async()=>{
 const i=identity(),c=child('api',{SHUTDOWN_FIXTURE_ACCOUNT:i.account});const ready=await c.wait('ready');const body=payload(i,randomUUID()),req=post(ready.port,body);await c.wait('gate');
 if(abortClient)req.request.destroy();c.kill('SIGTERM');await delay(80);
 assert.equal(c.exitCode,null);assert.ok(!c.events.some(e=>e.event==='db_closed'));
 c.send('release');if(!abortClient)assert.equal(await req.done,200);
 assert.equal((await c.exited).code,0);assert.equal(await prisma.incomingMessage.count({where:{phoneNumberId:i.account}}),1);
 assert.equal((await receiveMessages(body,i.account,prisma.incomingMessage)).count,0);
});

test('inbox SIGINT stops between interpretation and action; restart creates once',{timeout:20000},async()=>{
 const i=identity(),s=await source(i),c=child('inbox',{SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_SOURCE:s.id,SHUTDOWN_FIXTURE_PHASE:'interpret'});
 await c.wait('gate');c.kill('SIGINT');await delay(50);c.send('release');assert.equal((await c.exited).code,0);
 assert.equal((await prisma.incomingMessage.findUnique({where:{id:s.id}})).status,'interpreted');assert.equal(await prisma.reminder.count({where:{sourceMessageId:s.id}}),0);
 const r=child('inbox',{SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_SOURCE:s.id,SHUTDOWN_FIXTURE_PHASE:'resume'});assert.equal((await r.exited).code,0);
 const saved=await prisma.reminder.findMany({where:{sourceMessageId:s.id}});assert.equal(saved.length,1);users.push(saved[0].userId);
 assert.equal(await prisma.replyOutbox.count({where:{messageId:s.id}}),1);assert.equal(await prisma.scheduleOutbox.count({where:{reminderId:saved[0].id}}),1);
});

test('SIGKILL before inbox commit rolls back action; expired lease recovers without duplication',{timeout:20000},async()=>{
 const i=identity(),s=await source(i),c=child('inbox',{SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_SOURCE:s.id,SHUTDOWN_FIXTURE_PHASE:'action_commit'});
 await c.wait('gate');c.kill('SIGKILL');assert.equal((await c.exited).signal,'SIGKILL');
 assert.equal(await prisma.reminder.count({where:{sourceMessageId:s.id}}),0);assert.equal(await prisma.replyOutbox.count({where:{messageId:s.id}}),0);
 await prisma.incomingMessage.update({where:{id:s.id},data:{leaseUntil:new Date(0)}}); // Test-only lease expiry.
 const r=child('inbox',{SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_SOURCE:s.id,SHUTDOWN_FIXTURE_PHASE:'resume'});assert.equal((await r.exited).code,0);
 const rows=await prisma.reminder.findMany({where:{sourceMessageId:s.id}});assert.equal(rows.length,1);users.push(rows[0].userId);
 const again=child('inbox',{SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_SOURCE:s.id,SHUTDOWN_FIXTURE_PHASE:'resume'});assert.equal((await again.exited).code,0);
 assert.equal(await prisma.reminder.count({where:{sourceMessageId:s.id}}),1);assert.equal(await prisma.replyOutbox.count({where:{messageId:s.id}}),1);
});

for(const interruption of ['graceful','SIGKILL','deadline'])test('reminder interruption '+interruption+' does not duplicate accepted effect',{timeout:25000},async()=>{
 const i=identity(),reminder=await reminderFixture(i),name='shutdown-test-'+randomUUID();const q=new Queue(name,{connection});queues.push(q);
 await q.add('send-reminder',{reminderId:reminder.id,scheduleVersion:0},{jobId:reminder.id,removeOnComplete:false});
 const extra={SHUTDOWN_FIXTURE_ACCOUNT:i.account,SHUTDOWN_FIXTURE_USER:reminder.userId,SHUTDOWN_FIXTURE_QUEUE:name,SHUTDOWN_FIXTURE_PHASE:'held_send',...(interruption==='deadline'?{SHUTDOWN_TIMEOUT_MS:'200'}:{})};
 const c=child('reminder',extra);await c.wait('gate');
 if(interruption==='SIGKILL')c.kill('SIGKILL');else {c.kill('SIGTERM');if(interruption==='graceful'){await delay(50);assert.equal(c.exitCode,null);c.send('release')}}
 const result=await c.exited;
 assert.equal(interruption==='SIGKILL'?result.signal:result.code,interruption==='SIGKILL'?'SIGKILL':interruption==='deadline'?1:0);
 assert.equal(await prisma.event.count({where:{userId:reminder.userId,type:'fixture_external_accept'}}),1);
 const state=(await prisma.reminder.findUnique({where:{id:reminder.id}})).status;
 assert.equal(state,interruption==='graceful'?'provider_accepted':'sending');
 if(interruption!=='graceful'){
  await q.add('send-reminder',{reminderId:reminder.id,scheduleVersion:0},{jobId:reminder.id+'-duplicate'});
  const replay=child('reminder',{...extra,SHUTDOWN_FIXTURE_PHASE:'resume',SHUTDOWN_TIMEOUT_MS:'30000',SHUTDOWN_FIXTURE_JOB_COUNT:'2'});
  assert.equal((await replay.exited).code,0);
  assert.equal(await prisma.event.count({where:{userId:reminder.userId,type:'fixture_external_accept'}}),1);
  assert.equal((await prisma.reminder.findUnique({where:{id:reminder.id}})).status,'sending');
 }
});

for(const file of ['server.js','inbox-worker.js','queue/reminder.worker.js'])test('actual entrypoint rejects unverified Railway grace: '+file,{timeout:10000},async()=>{
 const c=spawn(process.execPath,[path.join(__dirname,'../dist',file)],{env:{...process.env,RAILWAY_SERVICE_ID:'fixture',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'0'},stdio:['ignore','pipe','pipe']});
 let err='';c.stderr.on('data',b=>err+=b);const code=await new Promise(r=>c.on('exit',r));assert.equal(code,1);assert.match(err,/railway_shutdown_budget_unverified/);
});
