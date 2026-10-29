// Linux-only fixture child. No production flag, real sender, AI network or dotenv.
const { Lifecycle }=require('../dist/runtime/lifecycle.js');
const { HttpDrain, httpDrain }=require('../dist/runtime/http.drain.js');
const { createPrismaClient }=require('../dist/config/database.js');
const { processInboxBatch }=require('../dist/domain/inbox.processor.js');
const { createReminderProcessor }=require('../dist/queue/reminder.processor.js');
const { createWebhookRouter }=require('../dist/http/webhook.handlers.js');
const { Worker }=require('bullmq');
const express=require('express');
const mode=process.env.SHUTDOWN_FIXTURE_MODE, phase=process.env.SHUTDOWN_FIXTURE_PHASE;
const url=new URL(process.env.INBOX_TEST_DATABASE_URL||'');
if(process.env.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'||!url.pathname.endsWith('_test'))throw Error('fixture_only');
const account=process.env.SHUTDOWN_FIXTURE_ACCOUNT;
let release;const gate=new Promise(r=>release=r);
process.on('message',message=>{if(message==='release')release()});
const notify=event=>process.send?.({event});
const life=new Lifecycle(mode==='reminder'?'reminders':mode,{log:event=>process.send?.(event)});
life.run(async()=>{
  const prisma=createPrismaClient(process.env.INBOX_TEST_DATABASE_URL);
  life.onClose(async()=>{await prisma.$disconnect();notify('db_closed')});
  if(mode==='api'){
    const app=express();app.use(httpDrain.reject);
    const inbox={createMany:async args=>{notify('gate');await gate;return prisma.incomingMessage.createMany(args)}};
    app.use(createWebhookRouter(inbox,()=>({appSecret:'fictional_hmac_only',phoneNumberId:account})));
    const server=app.listen(0,'127.0.0.1',()=>process.send?.({event:'ready',port:server.address().port}));
    life.onDrain(()=>{httpDrain.begin();return httpDrain.work.waitForIdle()});
    life.onDrain(()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections()}));
  }else if(mode==='inbox'){
    const sourceId=process.env.SHUTDOWN_FIXTURE_SOURCE;
    const store=new Proxy(prisma,{get(target,prop){if(prop==='$transaction')return callback=>target.$transaction(async tx=>{
      const result=await callback(tx);
      if(phase==='action_commit'){
        const row=await tx.incomingMessage.findUnique({where:{id:sourceId},select:{status:true}});
        if(row?.status==='reply_pending'){notify('gate');await gate;}
      }return result;
    },{timeout:20000});const value=target[prop];return typeof value==='function'?value.bind(target):value;}});
    const deps={buildContext:async()=>({}),interpret:async()=>{
      if(phase==='interpret'){notify('gate');await gate;}
      return {action:'create_reminder',title:'Fictional shutdown reminder',datetime:'2099-07-20T10:00:00-03:00',
        description:null,amount:null,category:null,reply:'not used as proof'};
    }};
    await processInboxBatch(store,deps,account,()=>life.stopping);
    notify('done');void life.stop('fixture_done');
  }else if(mode==='reminder'){
    const connection={host:'redis-test',port:6379,maxRetriesPerRequest:null};
    const send=async()=>{
      await prisma.event.create({data:{userId:process.env.SHUTDOWN_FIXTURE_USER,type:'fixture_external_accept',source:'fictional_sender',payload:{case:account}}});
      notify('gate');if(phase==='held_send')await gate;
      return {messages:[{id:'wamid.fictional-shutdown'}]};
    };
    const worker=new Worker(process.env.SHUTDOWN_FIXTURE_QUEUE,createReminderProcessor(prisma,account,send,undefined,{maxLateMs:60000}),
      {connection,autorun:false,lockDuration:500,stalledInterval:250});
    worker.on('error',()=>{});let completed=0;
    worker.on('completed',()=>{if(++completed>=Number(process.env.SHUTDOWN_FIXTURE_JOB_COUNT||1)){notify('done');void life.stop('fixture_done')}});
    worker.on('failed',()=>{notify('job_failed');void life.stop('fixture_failed')});
    life.onDrain(()=>worker.close());notify('ready');await worker.run();
  }else throw Error('invalid_fixture_mode');
});
