const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('worker de lembretes aguarda schema antes de consumir jobs durante deploy',async()=>{
 const calls=[];let checks=0;
 class Worker {constructor(name,processor,options){assert.equal(options.autorun,false);calls.push('constructed');}on(){}async run(){calls.push('run');}async close(){calls.push('close');}}
 const modules={
  'dotenv/config':{},bullmq:{Worker,DelayedError:class extends Error{}},
  '../config/prisma':{prisma:{reminder:{findFirst:async()=>{calls.push('check');if(++checks===1)throw Error('migration pending');}},$disconnect:async()=>{}}},
  '../config/redis':{redisConnection:{}},'../services/whatsapp.service':{},'../domain/reminder.delivery':{},'../domain/delivery.receipts':{},
  '../domain/reminder.execution':{maximumLateness:()=>3600000},
  './reminder.processor':{createReminderProcessor:()=>async()=>{}},
 };
 const code=ts.transpileModule(fs.readFileSync(require.resolve('../src/queue/reminder.worker.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:{},require:name=>{assert.ok(name in modules,name);return modules[name];},process:{env:{WHATSAPP_PHONE_NUMBER_ID:'fictional'},on(){},exit:()=>assert.fail('unexpected exit')},console:{log(){},error(){}},setTimeout:callback=>{queueMicrotask(callback);return {unref(){}};},clearTimeout(){}});
 await new Promise(setImmediate);
 assert.deepEqual(calls,['constructed','check','check','run']);
});
