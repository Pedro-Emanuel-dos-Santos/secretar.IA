require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='focus-'+randomUUID(),phones=[];
const now=new Date('2099-06-01T15:00:00Z');
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const owner=()=>{const phone='5591'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);return phone;};
async function row(phone,action,fields={},minutes=1,accepted=true,account=biz){
 const receivedAt=new Date(now.getTime()-minutes*60000);
 return p.incomingMessage.create({data:{phone,phoneNumberId:account,providerMessageId:randomUUID(),text:fields.text || 'Pedido',status:'completed',receivedAt,interpretation:intent(action,fields),reply:{create:{text:'Resposta',status:accepted?'provider_accepted':'pending',finishedAt:accepted?receivedAt:null}}}});
}
async function task(phone,title='Enviar proposta',minutes=2,accepted=true){
 const source=await row(phone,'create_reminder',{title,datetime:'2099-06-02T12:30:00Z'},minutes,accepted);
 const record=await persistReminder({phone,title,remindAt:'2099-06-02T12:30:00Z'},p,{phoneNumberId:biz,sourceMessageId:source.id});return {source,record};
}
const context=phone=>conversationContext(p,{phone,phoneNumberId:biz,text:'continuação',receivedAt:now});
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});

test('foco único troca reunião por tarefa sem carregar reunião anterior',async()=>{
 const phone=owner(),source=await row(phone,'create_appointment',{title:'Reunião antiga',datetime:'2099-06-02T13:00:00Z'},5);
 await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Reunião antiga',datetime:'2099-06-02T13:00:00Z',alertMinutes:[0]}),tx,source.id));
 const {record}=await task(phone);const c=await context(phone);assert.equal(c.conversationState.focusedReminder.id,record.id);assert.equal(c.conversationState.focusedAppointment,null);
});
test('referência exata recupera tarefa fora dos doze itens do contexto',async()=>{
 const phone=owner();for(let n=0;n<13;n++)await persistReminder({phone,title:'Anterior '+n,remindAt:'2099-06-01T18:00:00Z'},p,{phoneNumberId:biz});
 const {record}=await task(phone);const c=await context(phone);assert.equal(c.reminders.length,12);assert.ok(!c.reminders.some(r=>r.id===record.id));assert.equal(c.conversationState.focusedReminder.id,record.id);
});
test('resposta pendente, foco expirado e novo assunto não ressuscitam tarefa anterior',async()=>{
 for(const mode of ['pending','expired','note','list']){
  const phone=owner();await task(phone,'Primeira',mode==='expired'?31:5);
  if(mode==='pending')await task(phone,'Nova pendente',1,false);
  if(mode==='note')await row(phone,'save_note',{description:'Outro assunto'});
  if(mode==='list')await row(phone,'list_reminders');
  const c=await context(phone);assert.equal(c.conversationState.focusedReminder,null,mode);assert.equal(c.conversationState.focusedAppointment,null,mode);
 }
});
test('conversa breve conserva foco mas tarefa concluída não vira alvo ativo',async()=>{
 const phone=owner(),{record}=await task(phone);await row(phone,'conversation',{text:'Valeu!'});
 assert.equal((await context(phone)).conversationState.focusedReminder.id,record.id);
 await p.reminder.update({where:{id:record.id},data:{state:'completed'}});assert.equal((await context(phone)).conversationState.focusedReminder,null);
});
test('ID inventado de outra pessoa ou conta não entra no foco',async()=>{
 const phone=owner(),another=owner(),{record}=await task(another);
 await row(phone,'reschedule_reminder',{reminderId:record.id});assert.equal((await context(phone)).conversationState.focusedReminder,null);
 const separate=owner(),mine=await task(separate,'Da minha conta',5);await row(separate,'reschedule_reminder',{reminderId:mine.record.id},1,true,biz+'other');
 assert.equal((await context(separate)).conversationState.focusedReminder.id,mine.record.id);
});
test('cancela essa tarefa usa contexto persistido e mantém outra tarefa intacta',async()=>{
 const phone=owner(),first=await task(phone,'Outra tarefa',5),latest=await task(phone,'Tarefa em foco',2);
 const message=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Cancela essa tarefa',receivedAt:now,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('cancel_reminder',{reminderId:first.record.id})},biz);
 assert.equal((await p.reminder.findUnique({where:{id:first.record.id}})).state,'active');assert.equal((await p.reminder.findUnique({where:{id:latest.record.id}})).state,'cancelled');
 assert.match((await p.replyOutbox.findUnique({where:{messageId:message.id}})).text,/Cancelei/);
});

test('quinta de manhã e às nove completam reagendamento no dia pedido sem duplicar',async()=>{
 const phone=owner(),{record}=await task(phone);
 const first=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Muda essa tarefa para quinta de manhã',receivedAt:now,nextAttemptAt:new Date(0)}});
 const deps={buildContext:m=>conversationContext(p,m),interpret:async()=>intent('reschedule_reminder',{reminderId:record.id,datetime:'2099-06-09T12:00:00Z'})};
 await processInboxBatch(p,deps,biz);
 const question=await p.replyOutbox.findUnique({where:{messageId:first.id}});assert.match(question.text,/Que horas/);
 assert.equal((await p.reminder.findUnique({where:{id:record.id}})).remindAt.toISOString(),'2099-06-02T12:30:00.000Z');
 await p.replyOutbox.update({where:{messageId:first.id},data:{status:'provider_accepted',finishedAt:new Date(now.getTime()+1000)}});
 await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Às nove',receivedAt:new Date(now.getTime()+2000),nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,deps,biz);
 const updated=await p.reminder.findUnique({where:{id:record.id},include:{scheduleOutbox:true}});
 assert.equal(updated.remindAt.toISOString(),'2099-06-04T12:00:00.000Z');assert.equal(updated.scheduleVersion,1);assert.equal(updated.scheduleOutbox.status,'pending');assert.equal(await p.reminder.count({where:{user:{phone}}}),1);
});
test('referência preparada antes de outra alteração não cancela versão nova',async()=>{
 const phone=owner(),{record}=await task(phone);
 const prepared=await prepareConversation({phone,phoneNumberId:biz,text:'Cancela essa tarefa',receivedAt:now},{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('conversation')});
 assert.equal(prepared.expectedVersion,0);
 await p.reminder.update({where:{id:record.id},data:{title:'Contrato corrigido',scheduleVersion:{increment:1}}});
 const reply=await p.$transaction(tx=>manageReminders(phone,biz,prepared,tx));assert.match(reply,/antigo|mudou/);assert.equal((await p.reminder.findUnique({where:{id:record.id}})).state,'active');
});
