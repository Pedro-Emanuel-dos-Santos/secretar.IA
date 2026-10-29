const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
require('./integration.database.cjs');
if(process.env.NODE_ENV!=='test'||new URL(process.env.SHUTDOWN_TEST_REDIS_URL||'').hostname!=='redis-test')throw Error('isolated_fixture_required');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
for(const [file,ready,budget] of [['server.js','API iniciada.',45],['inbox-worker.js','Worker de entrada iniciado.',150],['queue/reminder.worker.js','Worker de lembretes iniciado.',75]])for(const signal of ['SIGTERM','SIGINT'])test('actual entrypoint idle drain '+file+' '+signal,{timeout:15000},async()=>{
 const child=spawn(process.execPath,[path.join(__dirname,'../dist',file)],{env:{...process.env,RAILWAY_SERVICE_ID:'fixture',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:String(budget),SHUTDOWN_TIMEOUT_MS:file.startsWith('queue/')?'60000':file==='inbox-worker.js'?'120000':'30000',PORT:'3300',WHATSAPP_PHONE_NUMBER_ID:'idle-fixture'},stdio:['ignore','pipe','pipe']});
 let output='',code;child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});const exited=new Promise(r=>child.once('exit',c=>{code=c;r(c)}));
 try{
  const until=Date.now()+10000;while(!output.includes(ready)&&code===undefined&&Date.now()<until)await delay(10);
  assert.ok(output.includes(ready),'startup reached');child.kill(signal);assert.equal(await exited,0);
  const events=output.split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
  assert.equal(events.find(x=>x.event==='shutdown_started')?.reason,signal);assert.equal(events.find(x=>x.event==='shutdown_complete')?.clean,true);
 }finally{if(code===undefined)child.kill('SIGKILL')}
});
