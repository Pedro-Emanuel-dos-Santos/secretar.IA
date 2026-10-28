require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts'),{persistReminder}=require('../src/domain/reminder.creator.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts'),{prepareReminderExecution}=require('../src/domain/reminder.execution.ts');
const {relaySchedules}=require('../src/domain/schedule.relay.ts'),{manageReminders}=require('../src/domain/reminder.management.ts');
const {WhatsAppSendRejected,WhatsAppSendNotAttempted}=require('../src/domain/whatsapp.errors.ts');
const {createWhatsAppSender}=require('../src/services/whatsapp.sender.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts'),{interpretMessage}=require('../src/services/ai.service.ts'),{aiRouter}=require('../src/ai/ai-router.ts');
const {aiOperationalOverview}=require('../src/domain/ai.operations.ts');
const {executeAppointment}=require('../src/domain/appointments.ts'),{executePreferences}=require('../src/domain/preferences.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='reliable-'+randomUUID(),phones=[];
async function setup(){const phone='5582'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);const source=await p.incomingMessage.create({data:{phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'aviso fictício',receivedAt:new Date(Date.now()-30*3600000),status:'completed'}});const reminder=await persistReminder({phone,title:'Água fictícia',remindAt:new Date(Date.now()+86400000).toISOString()},p,{phoneNumberId:account,sourceMessageId:source.id});await p.reminder.update({where:{id:reminder.id},data:{remindAt:new Date(Date.now()-1000)}});return {phone,source,reminder};}
const saved=c=>p.reminder.findUniqueOrThrow({where:{id:c.reminder.id}});
async function due(c){await p.reminder.update({where:{id:c.reminder.id},data:{deliveryRetryAt:new Date(0)}});await p.scheduleOutbox.update({where:{reminderId:c.reminder.id},data:{nextAttemptAt:new Date(0)}});}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[account,account+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});
test('rejeição temporária gera retry persistente com versão nova, sem repetir job antigo',async()=>{
 const c=await setup();let sends=0;
 const send=async()=>{sends++;if(sends<3)throw new WhatsAppSendRejected(400,130429);return {messages:[{id:'wamid.fixture'}]};};
 assert.equal(await deliverReminder(c.reminder.id,account,p,send,0),'retry_scheduled');let r=await saved(c);assert.equal(r.status,'delivery_retry');assert.equal(r.scheduleVersion,1);assert.equal(r.deliveryAttempts,1);
 assert.ok(r.deliveryRetryAt.getTime()>Date.now());assert.equal((await prepareReminderExecution(p,r.id,account,1)).kind,'defer');assert.equal(await deliverReminder(r.id,account,p,()=>assert.fail(),0),'stale');
 for(const version of [1,2]){await due(c);const jobs=[];await relaySchedules(p,{add:async(name,data,opts)=>jobs.push({data,opts})},{phoneNumberId:account,reminderId:r.id});assert.equal(jobs.length,1);assert.equal(jobs[0].data.scheduleVersion,version);await deliverReminder(r.id,account,p,send,version);}
 r=await saved(c);assert.equal(r.status,'provider_accepted');assert.equal(r.deliveryAttempts,3);assert.equal(sends,3);assert.equal(await deliverReminder(r.id,account,p,()=>assert.fail(),2),'skipped');
});
test('três rejeições confirmadas encerram retries e respeitam Retry-After',async()=>{
 const c=await setup();for(let version=0;version<3;version++){
  const started=Date.now();try{await deliverReminder(c.reminder.id,account,p,async()=>{throw new WhatsAppSendRejected(429,130429,120000);},version);}catch{}
  if(version<2){assert.ok((await saved(c)).deliveryRetryAt.getTime()>=started+120000);await due(c);}
 }
 const r=await saved(c);assert.equal(r.status,'retry_exhausted');assert.equal(r.deliveryAttempts,3);assert.equal(r.scheduleVersion,2);assert.equal(await deliverReminder(r.id,account,p,()=>assert.fail(),2),'skipped');
});
test('metadata sem POST permite retry; rejeição de template e timeout de POST não são repetidos',async()=>{
 const metadata=await setup();assert.equal(await deliverReminder(metadata.reminder.id,account,p,async()=>{throw new WhatsAppSendNotAttempted();}),'retry_scheduled');
 for(const [error,status] of [[new WhatsAppSendRejected(400,132001),'blocked_template'],[new WhatsAppSendRejected(401,190),'provider_rejected'],[Error('timeout after HTTP'),'delivery_unknown']]){
  const c=await setup();await assert.rejects(deliverReminder(c.reminder.id,account,p,async()=>{throw error;}));assert.equal((await saved(c)).status,status);assert.equal((await saved(c)).scheduleVersion,0);assert.equal(await deliverReminder(c.reminder.id,account,p,()=>assert.fail()),'skipped');
 }
});
test('cancelamento durante espera impede retry; reagendamento explícito zera o orçamento de entrega',async()=>{
 for(const action of ['cancel_reminder','reschedule_reminder']){
  const c=await setup();await deliverReminder(c.reminder.id,account,p,async()=>{throw new WhatsAppSendRejected(400,131056);});
  const reply=await p.$transaction(tx=>manageReminders(c.phone,account,{action,reply:'interno',title:null,description:null,datetime:new Date(Date.now()+86400000).toISOString(),amount:null,category:null,reminderId:c.reminder.id,expectedVersion:1},tx));
  const r=await saved(c);assert.equal(await deliverReminder(r.id,account,p,()=>assert.fail(),1),action==='cancel_reminder'?'skipped':'stale');
  if(action==='reschedule_reminder'){assert.equal(r.deliveryAttempts,0);assert.equal(r.deliveryRetryAt,null);assert.equal(r.status,'scheduling_pending');}else assert.equal(r.state,'cancelled');
 }
});
test('rollback da preparação do retry não grava só uma metade nem troca de conta',async()=>{
 const c=await setup();const store={reminder:p.reminder,$transaction:cb=>p.$transaction(async tx=>{await cb(tx);throw Error('rollback fixture');})};
 await assert.rejects(deliverReminder(c.reminder.id,account,store,async()=>{throw new WhatsAppSendRejected(400,130429);}),/rollback fixture/);
 const r=await saved(c),outbox=await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:r.id}});assert.equal(r.status,'sending');assert.equal(r.scheduleVersion,0);assert.notEqual(outbox.lastError,'send_rejected_retryable');
 await assert.rejects(deliverReminder(r.id,account+'other',p,()=>assert.fail()),/incompatível/);
});
test('cancelar compromisso ou desativar resumo remove avisos aguardando retentativa',async()=>{
 for(const kind of ['appointment','daily_summary']){
  const c=await setup();let appointment;
  if(kind==='appointment'){
   appointment=await p.appointment.create({data:{userId:c.reminder.userId,phoneNumberId:account,title:'Reunião fixture',startsAt:new Date(Date.now()+86400000)}});
   await p.reminder.update({where:{id:c.reminder.id},data:{appointmentId:appointment.id}});
  }else await p.reminder.update({where:{id:c.reminder.id},data:{kind:'daily_summary'}});
  await deliverReminder(c.reminder.id,account,p,async()=>{throw new WhatsAppSendRejected(400,130429);});
  await p.$transaction(tx=>kind==='appointment'?executeAppointment(c.phone,account,{action:'cancel_appointment',appointmentId:appointment.id},tx,c.source.id):executePreferences(c.phone,account,{action:'set_preferences',summaryEnabled:false},tx,c.source.id));
  assert.equal((await saved(c)).state,'cancelled');assert.equal((await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:c.reminder.id}})).status,'cancelled');
  assert.equal((await prepareReminderExecution(p,c.reminder.id,account,(await saved(c)).scheduleVersion)).kind,'skipped');
 }
});
test('edição do título durante retry mantém próxima tentativa recuperável',async()=>{
 const c=await setup();await deliverReminder(c.reminder.id,account,p,async()=>{throw new WhatsAppSendRejected(400,130429);});
 await p.$transaction(tx=>manageReminders(c.phone,account,{action:'edit_reminder',newTitle:'Novo título',reminderId:c.reminder.id,expectedVersion:1},tx));
 const r=await saved(c),outbox=await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:r.id}});assert.equal(r.title,'Novo título');assert.equal(r.scheduleVersion,2);assert.equal(outbox.status,'pending');assert.equal(r.deliveryAttempts,1);assert.equal((await prepareReminderExecution(p,r.id,account,2)).kind,'defer');
});
test('fora da janela verifica template na conta correta e persiste aceitação sem rede real',async()=>{
 const c=await setup(),calls=[];
 const env={WHATSAPP_PHONE_NUMBER_ID:account,WHATSAPP_ACCESS_TOKEN:'fixture',WHATSAPP_BUSINESS_ACCOUNT_ID:'123',WHATSAPP_REMINDER_TEMPLATE_NAME:'reminder_test',WHATSAPP_REMINDER_TEMPLATE_LANGUAGE:'pt_BR',WHATSAPP_REMINDER_TEMPLATE_APPROVED:'true'};
 const send=createWhatsAppSender(p,env,async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify(calls.length===1?{data:[{name:'reminder_test',language:'pt_BR',category:'UTILITY',status:'APPROVED',components:[{type:'BODY',text:'Lembrete: {{1}}'}]}]}:{messages:[{id:'wamid.template.fixture'}]}),{status:200,headers:{'content-type':'application/json'}});});
 assert.equal(await deliverReminder(c.reminder.id,account,p,(phone,text)=>send(phone,text,'reminder')),'provider_accepted');assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].opts.body).type,'template');assert.equal((await saved(c)).providerMessageId,'wamid.template.fixture');
});
test('ledger grava rota, tokens, custo e tentativas; panorama isola conta comercial',async()=>{
 const c=await setup(),m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'quero conversar fixture'}});
 const deps={buildContext:async()=>({currentMessage:'quero conversar fixture'}),interpret:(ctx,onUsage)=>interpretMessage(ctx,onUsage,i=>aiRouter(i,{env:{AI_MODE:'openai'},openai:async()=>({provider:'openai',content:JSON.stringify({action:'conversation',reply:'Podemos conversar.'}),usage:{provider:'openai',model:'gpt-4.1-mini',inputTokens:1000,cachedInputTokens:500,outputTokens:100,outcome:'completed'}})}))};
 await processInboxBatch(p,deps,account);const usage=await p.aiUsage.findFirstOrThrow({where:{messageId:m.id}});assert.equal(usage.routingReason,'configured_primary_openai');assert.equal(usage.fallbackUsed,false);assert.equal(usage.providerAttempts.length,1);assert.equal(usage.estimatedCostUsd,0.00041);assert.equal(usage.costStatus,'estimated');assert.doesNotMatch(JSON.stringify(usage.providerAttempts),/quero conversar/);
 const other=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account+'other',providerMessageId:randomUUID(),text:'outro'}});await p.aiUsage.create({data:{messageId:other.id,attempt:1,provider:'private-other',estimatedCostUsd:99}});
 const overview=await aiOperationalOverview(p,account);assert.equal(overview.groups.length,1);assert.equal(overview.groups[0].estimatedCostUsd,0.00041);assert.equal(overview.groups[0].requests,1);
});
test('falha de fallback persiste as duas tentativas sem ação nem tokens financeiros inventados',async()=>{
 const c=await setup(),m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'oi fixture'}});
 const deps={buildContext:async()=>({currentMessage:'oi fixture'}),interpret:(ctx,onUsage)=>interpretMessage(ctx,onUsage,i=>aiRouter(i,{env:{AI_MODE:'hybrid',OLLAMA_BASE_URL:'http://fixture'},ollama:async()=>{throw Error('PRIVATE ollama');},openai:async()=>{throw Error('PRIVATE openai');}}))};
 await processInboxBatch(p,deps,account);const usage=await p.aiUsage.findFirstOrThrow({where:{messageId:m.id}});assert.equal(usage.outcome,'failed_or_unknown');assert.equal(usage.fallbackUsed,true);assert.equal(usage.providerAttempts.length,2);assert.equal(usage.estimatedCostUsd,null);assert.equal(usage.inputTokens,null);assert.doesNotMatch(JSON.stringify(usage),/PRIVATE/);assert.equal(await p.replyOutbox.count({where:{messageId:m.id}}),0);assert.equal(await p.reminder.count({where:{sourceMessageId:m.id}}),0);
});
