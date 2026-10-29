const h=require('./lib/beta-fixtures.cjs');
const {assert,p,connection,save,load,harness,base,createPrismaClient,databaseUrl}=h;
const {Queue,Worker}=require('bullmq');
const {relaySchedules}=require('../src/domain/schedule.relay.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {createReminderProcessor}=require('../src/queue/reminder.processor.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {retrieveContext}=require('../src/domain/context.retrieval.ts');
const {WhatsAppSendRejected}=require('../src/domain/whatsapp.errors.ts');
(async()=>{
 const state=load('state'),ui=await harness(state),checks={};let queue=new Queue('reminders',{connection}),worker;
 try{
  const modelNever=()=>assert.fail('No extra paid inference allowed');
  const otherPhone='5500000099999',otherAccount=state.account+'other';
  for(const [phone,account] of [[otherPhone,state.account],[state.phone,otherAccount]]){
   const ctx=await conversationContext(p,{phone,phoneNumberId:account,text:'entrevista trabalho',receivedAt:new Date('2099-06-01T12:10:00Z')});assert.equal(ctx.personalMemories.length,0);assert.equal(ctx.appointments.length,0);assert.equal(ctx.contextualMemory.items.length,0);
  }checks.isolation={differentUser:true,sameUserDifferentAccount:true};
  const noteCount=await p.event.count({where:{user:{phone:state.phone},type:'secretary_note'}});
  await ui.receive('Estou buscando emprego. Não guarde isso como memória ou anotação.');await ui.process({...base,action:'save_note',description:'Este registro não pode existir.'});await ui.deliver();assert.equal(await p.event.count({where:{user:{phone:state.phone},type:'secretary_note'}}),noteCount);checks.optOut={unsafeModelWriteBlocked:true};
  await ui.receive('DESATIVAR MEMORIA');await ui.process();await ui.deliver();
  let ctx=await conversationContext(p,{phone:state.phone,phoneNumberId:state.account,text:'trabalho',receivedAt:new Date('2099-06-01T12:10:00Z')});assert.equal(ctx.personalMemoryEnabled,false);assert.equal(ctx.personalMemories.length,0);assert.ok(!ctx.contextualMemory.items.some(x=>x.id===state.memoryId));checks.revocation={contextContainsPersonalMemory:false};
  await ui.receive('Apaga a memória Carreira');await ui.process({...base,action:'forget_personal',memoryId:state.memoryId,search:'Carreira',expectedVersion:0});await ui.deliver();assert.equal(await p.event.count({where:{id:state.memoryId}}),0);
  await ui.receive('Apaga a anotação de revisar meus projetos');await ui.process({...base,action:'delete_note',noteId:state.noteId,expectedVersion:0});await ui.deliver();assert.equal(await p.event.count({where:{id:state.noteId}}),0);
  ctx=await conversationContext(p,{phone:state.phone,phoneNumberId:state.account,text:'revisar meus projetos',receivedAt:new Date('2099-06-01T12:10:00Z')});
  checks.deletion={personalRemoved:true,noteRemoved:true,deletedNoteInPresentationHistory:JSON.stringify(ctx.lastMessages).toLowerCase().includes('preciso revisar meus projetos')};
  save('privacy-checkpoint',checks);assert.equal(checks.deletion.deletedNoteInPresentationHistory,false,'Deleted plan note resurrected through historical proposal/confirmation');
  const interrupted=await ui.receive('Me lembra de checar anexos amanhã às 11h.');await p.incomingMessage.update({where:{id:interrupted.id},data:{status:'interpreted',interpretation:{...base,action:'create_reminder',title:'Conferir anexos fictícios',datetime:'2099-06-02T11:00:00-03:00'}}});
  const restarted=createPrismaClient(databaseUrl);try{await processInboxBatch(restarted,{buildContext:modelNever,interpret:modelNever},state.account);await processInboxBatch(restarted,{buildContext:modelNever,interpret:modelNever},state.account);}finally{await restarted.$disconnect();}
  assert.equal(await p.reminder.count({where:{sourceMessageId:interrupted.id}}),1);assert.equal(await p.replyOutbox.count({where:{messageId:interrupted.id}}),1);await ui.deliver();checks.interruptedInbox={recoveredWithoutModel:true,reminderCount:1,replyCount:1};
  const rate=await ui.receive('Me lembra do limite fictício amanhã às 11h30');await ui.process({...base,action:'create_reminder',title:'Limite fictício',datetime:'2099-06-02T11:30:00-03:00'});await ui.deliver();
  const uncertain=await ui.receive('Me lembra do timeout fictício amanhã às 12h');await ui.process({...base,action:'create_reminder',title:'Timeout fictício',datetime:'2099-06-02T12:00:00-03:00'});await ui.deliver();
  const rateRow=await p.reminder.findUniqueOrThrow({where:{sourceMessageId:rate.id}}),unknownRow=await p.reminder.findUniqueOrThrow({where:{sourceMessageId:uncertain.id}});
  await relaySchedules(p,queue,{phoneNumberId:state.account});
  const sample=await p.reminder.findFirstOrThrow({where:{user:{phone:state.phone},title:{contains:'portfólio'}}});const beforeJobs=await queue.getJobCounts();
  await p.scheduleOutbox.update({where:{reminderId:sample.id},data:{status:'pending',attempts:0,nextAttemptAt:new Date(0)}});
  await relaySchedules(p,{add:async(...args)=>{await queue.add(...args);throw Error('ack lost after Redis accepted');}},{phoneNumberId:state.account});
  assert.equal((await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:sample.id}})).status,'pending');
  await queue.close();queue=new Queue('reminders',{connection});await p.scheduleOutbox.update({where:{reminderId:sample.id},data:{nextAttemptAt:new Date(0)}});await relaySchedules(p,queue,{phoneNumberId:state.account});assert.equal((await queue.getJobCounts()).delayed,beforeJobs.delayed);checks.publishInterruption={outboxRecovered:true,stableJobIdNoDuplicate:true};
  // Keep a stale payload to prove real worker version checks suppress it.
  const staleAlert=await p.reminder.findFirstOrThrow({where:{appointmentId:state.appointmentId,state:'cancelled'}}),appointmentReminder=await p.reminder.findFirstOrThrow({where:{appointmentId:state.appointmentId,state:'active'}});assert.ok(staleAlert.scheduleVersion>0);await queue.add('send-reminder',{reminderId:staleAlert.id,scheduleVersion:0},{jobId:'stale-fixture-'+staleAlert.id});
  let virtualNow=Date.parse('2099-06-02T13:00:00Z'),rateAttempts=0,uncertainAttempts=0;
  const sentBefore=ui.sent.length;
  const send=async(phone,text,controls)=>{if(text.includes('Limite fictício')&&++rateAttempts===1)throw new WhatsAppSendRejected(400,130429);if(text.includes('Timeout fictício')){uncertainAttempts++;throw Error('accepted externally but response lost - fixture');}return ui.reminderSender(phone,text,'reminder',controls);};
  const processor=createReminderProcessor(p,state.account,send,undefined,{now:()=>virtualNow});
  worker=new Worker('reminders',async(job,token)=>{const row=await p.reminder.findUniqueOrThrow({where:{id:job.data.reminderId}});virtualNow=row.remindAt.getTime();return processor(job,token);},{connection});worker.on('error',()=>{});
  async function drain(){for(const job of await queue.getJobs(['delayed']))await job.promote();const until=Date.now()+15000;while(Date.now()<until){const c=await queue.getJobCounts('wait','active','delayed');if(!c.wait&&!c.active&&!c.delayed)return;await new Promise(r=>setTimeout(r,50));}throw Error('Isolated worker did not drain');}
  await drain();let r=await p.reminder.findUniqueOrThrow({where:{id:rateRow.id}});assert.equal(r.status,'delivery_retry');assert.equal(r.deliveryAttempts,1);
  await p.reminder.update({where:{id:r.id},data:{deliveryRetryAt:new Date(0)}});await p.scheduleOutbox.update({where:{reminderId:r.id},data:{nextAttemptAt:new Date(0)}});await relaySchedules(p,queue,{phoneNumberId:state.account});await drain();
  r=await p.reminder.findUniqueOrThrow({where:{id:r.id}});assert.equal(r.status,'provider_accepted');assert.equal(r.deliveryAttempts,2);assert.equal(rateAttempts,2);checks.knownRetry={attempts:2,newQueueVersion:r.scheduleVersion,persistedStatus:r.status};
  const unknown=await p.reminder.findUniqueOrThrow({where:{id:unknownRow.id}});assert.equal(unknown.status,'delivery_unknown');await processor({data:{reminderId:unknown.id,scheduleVersion:unknown.scheduleVersion},moveToDelayed:()=>assert.fail()});assert.equal(uncertainAttempts,1);checks.uncertainReminder={persistedStatus:'delivery_unknown',attemptedEffects:1,noAutomaticResend:true};
  const accepted=await p.reminder.findMany({where:{user:{phone:state.phone},status:'provider_accepted'}});for(const row of accepted){if(row.id===rateRow.id||row.sourceMessageId===interrupted.id)assert.notEqual(row.deliveryStatus,'delivered');await ui.receipt(row.providerMessageId);assert.equal((await p.reminder.findUniqueOrThrow({where:{id:row.id}})).deliveryStatus,'delivered');}
  for(const id of [sample.id,appointmentReminder.id,rateRow.id,(await p.reminder.findUniqueOrThrow({where:{sourceMessageId:interrupted.id}})).id])assert.equal((await p.reminder.findUniqueOrThrow({where:{id}})).status,'provider_accepted');
  const reminderPayloads=ui.sent.slice(sentBefore);assert.ok(reminderPayloads.length>=2);assert.ok(reminderPayloads.every(x=>x.payload.type==='template'));checks.delivery={outsideWindowTemplatesSimulated:reminderPayloads.length,receiptPersisted:accepted.length,staleJobSuppressed:true,acceptedNotAssumedDelivered:true};
  const reply=await ui.receive('Podemos conversar?');await ui.process({...base,action:'conversation',reply:'Podemos organizar as próximas etapas.'});let replyAttempts=0;await relayReplies(p,async()=>{replyAttempts++;throw Error('reply response lost - fixture');},state.account);await relayReplies(p,()=>assert.fail('Uncertain reply resent'),state.account);assert.equal(replyAttempts,1);assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:reply.id},include:{reply:true}})).reply.status,'delivery_unknown');checks.uncertainReply={persistedStatus:'delivery_unknown',attempts:1};
  checks.queue=await queue.getJobCounts();checks.modelsUsedForFailures='fixtures only; real OpenAI only in plan/correction checkpoints';save('failure-journeys',checks);save('state',state);console.log(JSON.stringify({passed:true,checks}));
 }finally{if(worker)await worker.close();await queue.close();await ui.close();await p.$disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
