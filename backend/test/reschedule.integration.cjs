require('./register.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const { createPrismaClient } = require("../src/config/database.ts");
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {relaySchedules}=require('../src/domain/schedule.relay.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts');
const {receiveDeliveryReceipts,reconcileStoredDelivery}=require('../src/domain/delivery.receipts.ts');
const {WhatsAppPreflightError}=require('../src/domain/whatsapp.policy.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const business='reschedule-'+randomUUID(),phone='5594'+String(Date.now()).slice(-11);
before(()=>p.$connect());
async function clear(){await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});}
after(async()=>{await clear();await p.$disconnect()});
async function make(){
 const source=await p.incomingMessage.create({data:{providerMessageId:randomUUID(),phoneNumberId:business,phone,text:'água',status:'completed'}});
 return persistReminder({phone,title:'beber água',remindAt:'2099-07-20T10:00:00-03:00'},p,{phoneNumberId:business,sourceMessageId:source.id});
}
const intent=(id,extra={})=>({action:'reschedule_reminder',title:null,description:null,datetime:'2099-07-21T10:00:00-03:00',amount:null,category:null,reply:'ok',reminderId:id,...extra});
const manage=i=>p.$transaction(tx=>manageReminders(phone,business,i,tx));
test('reagendamento preserva lembrete, cria nova versão e ignora jobs antigos',async()=>{
 await clear();const r=await make();const jobs=[];const queue={add:async(name,data,options)=>jobs.push({data,options})};
 await relaySchedules(p,queue,{phoneNumberId:business});
 assert.match(await manage(intent(r.id)),/Alterei o horário/);
 const updated=await p.reminder.findUniqueOrThrow({where:{id:r.id}});
 assert.equal(updated.scheduleVersion,1);assert.equal(updated.remindAt.toISOString(),'2099-07-21T13:00:00.000Z');
 assert.equal(await p.reminder.count({where:{user:{phone}}}),1);
 assert.equal(await deliverReminder(r.id,business,p,()=>assert.fail(),0),'stale');
 await relaySchedules(p,queue,{phoneNumberId:business});
 assert.equal(jobs[1].data.scheduleVersion,1);assert.notEqual(jobs[0].options.jobId,jobs[1].options.jobId);
 let sends=0;await deliverReminder(r.id,business,p,async()=>{sends++;return {messages:[{id:'wamid.rescheduled'}]}},1);
 await deliverReminder(r.id,business,p,()=>assert.fail(),1);assert.equal(sends,1);
});
test('publicação antiga em voo não confirma nem bloqueia nova versão', {timeout:10000}, async()=>{
 await clear();const r=await make();let enter,release;const started=new Promise(res=>enter=res),gate=new Promise(res=>release=res);
 const old=relaySchedules(p,{add:async()=>{enter();await gate;}},{phoneNumberId:business});
 await started;await manage(intent(r.id));release();await old;
 assert.equal((await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:r.id}})).status,'pending');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).status,'scheduling_pending');
 await relaySchedules(p,{add:async()=>{}},{phoneNumberId:business});
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).status,'scheduled');
});
test('reagendamento disputa com envio sem permitir o job antigo', {timeout:10000}, async()=>{
 await clear();const r=await make();let enter,release;const started=new Promise(res=>enter=res),gate=new Promise(res=>release=res);
 const store={reminder:{findUnique:async args=>{const row=await p.reminder.findUnique(args);enter();await gate;return row},updateMany:args=>p.reminder.updateMany(args)}};
 const old=deliverReminder(r.id,business,store,()=>assert.fail());await started;await manage(intent(r.id));release();
 assert.equal(await old,'skipped');
});
test('reagendamento recusa data inválida, alvo ambíguo, outra conta e envio iniciado',async()=>{
 await clear();const r=await make();
 for(const datetime of [null,'invalid','2020-01-01T10:00:00Z']){
  assert.doesNotMatch(await manage(intent(r.id,{datetime})),/Alterei/);
 }
 await p.$transaction(async tx=>assert.doesNotMatch(await manageReminders(phone,business+'other',intent(r.id),tx),/Alterei/));
 await make();assert.match(await manage(intent(null,{search:'água'})),/Qual deles/);
 await p.reminder.update({where:{id:r.id},data:{status:'sending'}});
 assert.match(await manage(intent(r.id)),/já entrou em envio/);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).scheduleVersion,0);
});
test('falta de template é bloqueio conhecido sem fingir envio incerto',async()=>{
 await clear();const r=await make();
 await assert.rejects(deliverReminder(r.id,business,p,async()=>{throw new WhatsAppPreflightError('template_required')}));
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).status,'blocked_template');
 assert.equal(await deliverReminder(r.id,business,p,()=>assert.fail()),'skipped');
});
test('recibos projetam leitura e não regridem por eventos atrasados ou outra conta',async()=>{
 await clear();const r=await make();const wamid='wamid.'+randomUUID();
 await p.reminder.update({where:{id:r.id},data:{providerMessageId:wamid,status:'provider_accepted'}});
 await p.replyOutbox.create({data:{messageId:r.sourceMessageId,text:'confirmado',status:'provider_accepted',providerMessageId:wamid}});
 const receive=async(status,second,number=business)=>receiveDeliveryReceipts({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:number},statuses:[{id:wamid,status,timestamp:String(second),recipient_id:phone,errors:status==='failed'?[{code:130497}]:[]}]}}]}]},number,p);
 await receive('read',1792508400);await receive('sent',1792508401);await receive('failed',1792508402);
 for(const row of [await p.reminder.findUniqueOrThrow({where:{id:r.id}}),await p.replyOutbox.findUniqueOrThrow({where:{messageId:r.sourceMessageId}})])assert.equal(row.deliveryStatus,'read');
 await receive('failed',1792508403,business+'other');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).deliveryStatus,'read');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).status,'provider_accepted');
});
test('recibo anterior à resposta HTTP é recuperado após vincular identidade',async()=>{
 await clear();const r=await make();const id='wamid.early.'+randomUUID();
 await receiveDeliveryReceipts({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:business},statuses:[{id,status:'read',timestamp:'1792508400',recipient_id:phone}]}}]}]},business,p);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).deliveryStatus,null);
 await p.reminder.update({where:{id:r.id},data:{providerMessageId:id,status:'provider_accepted'}});
 await reconcileStoredDelivery(p,business,id);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).deliveryStatus,'read');
 assert.equal(await p.event.count({where:{user:{phone}}}),1);
});
