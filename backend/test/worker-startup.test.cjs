const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
for(const stopDuringSchema of [false,true])test('reminder startup gates consumption on schema; stopDuringSchema='+stopDuringSchema,async()=>{
 const calls=[];let checks=0,main,life;
 class Lifecycle {constructor(){life=this;this.stopping=false}run(fn){main=Promise.resolve().then(fn)}onClose(){}onDrain(fn){this.drain=fn}async wait(){if(stopDuringSchema)this.stopping=true}}
 class Worker {constructor(name,processor,options){assert.equal(options.autorun,false);calls.push('constructed')}on(){}async run(){calls.push('run')}async close(){calls.push('close')}}
 const modules={
  '../runtime/lifecycle':{Lifecycle},'dotenv/config':{},bullmq:{Worker},
  '../config/prisma':{prisma:{reminder:{findFirst:async()=>{calls.push('check');if(++checks===1)throw Error('migration pending')}},$disconnect:async()=>{}}},
  '../config/redis':{redisConnection:{}},'../services/whatsapp.service':{},'../domain/delivery.receipts':{},
  '../domain/reminder.execution':{maximumLateness:()=>3600000},'./reminder.processor':{createReminderProcessor:()=>async()=>{}},
 };
 const code=ts.transpileModule(fs.readFileSync(require.resolve('../src/queue/reminder.worker.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:{},require:name=>{const normalized=name.replace(/\.js$/,'');assert.ok(normalized in modules,normalized);return modules[normalized]},process:{env:{WHATSAPP_PHONE_NUMBER_ID:'fictional'}},console:{log(){},error(){}}});
 await main;
 assert.deepEqual(calls,stopDuringSchema?['constructed','check']:['constructed','check','check','run']);
 await life.drain();assert.equal(calls.at(-1),'close');
});
