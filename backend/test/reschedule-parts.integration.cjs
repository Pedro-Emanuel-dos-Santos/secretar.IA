require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='parts-'+randomUUID(),phone='5561'+String(Date.now()).slice(-9);
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const incoming=(text,extra={})=>p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text,receivedAt:new Date('2099-06-01T15:00:00Z'),nextAttemptAt:new Date(0),...extra}});
const deps=interpretation=>({buildContext:m=>conversationContext(p,m),interpret:async()=>interpretation});
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:biz}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});
test('correção só de hora mantém dia da tarefa e persiste versão/outbox uma vez',async()=>{
 const task=await persistReminder({phone,title:'Enviar proposta',remindAt:'2099-06-02T12:30:00Z'},p,{phoneNumberId:biz});
 const source=await incoming('Melhor às dez');const d=deps(intent('reschedule_reminder',{reminderId:task.id,datetime:'2099-06-09T13:00:00Z'}));await processInboxBatch(p,d,biz);
 let changed=await p.reminder.findUnique({where:{id:task.id},include:{scheduleOutbox:true}});assert.equal(changed.remindAt.toISOString(),'2099-06-02T13:00:00.000Z');assert.equal(changed.scheduleVersion,1);assert.equal(changed.scheduleOutbox.status,'pending');
 await processInboxBatch(p,d,biz);changed=await p.reminder.findUnique({where:{id:task.id}});assert.equal(changed.scheduleVersion,1);assert.equal(await p.replyOutbox.count({where:{messageId:source.id}}),1);
});
test('correção só de dia mantém hora do compromisso e intervalos dos avisos',async()=>{
 const source=await incoming('Visita Ana',{status:'completed'});await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Visita Ana',datetime:'2099-06-02T12:30:00Z',alertMinutes:[60,10]}),tx,source.id));
 const appointment=await p.appointment.findUnique({where:{sourceMessageId:source.id}});await incoming('Passa para depois de amanhã');await processInboxBatch(p,deps(intent('reschedule_appointment',{appointmentId:appointment.id,datetime:'2099-06-09T03:00:00Z'})),biz);
 const changed=await p.appointment.findUnique({where:{id:appointment.id},include:{reminders:{where:{state:'active'}}}});assert.equal(changed.startsAt.toISOString(),'2099-06-03T12:30:00.000Z');assert.equal(changed.reminders.length,2);assert.deepEqual(changed.reminders.map(r=>(changed.startsAt-r.remindAt)/60000).sort((a,b)=>a-b),[10,60]);
});
test('período vago não altera tarefa nem promete novo horário',async()=>{
 const task=await persistReminder({phone,title:'Retornar fornecedor',remindAt:'2099-06-02T21:00:00Z'},p,{phoneNumberId:biz}),source=await incoming('Passa para quinta de manhã');
 await processInboxBatch(p,deps(intent('reschedule_reminder',{reminderId:task.id,datetime:'2099-06-04T12:00:00Z'})),biz);
 const unchanged=await p.reminder.findUnique({where:{id:task.id}});assert.equal(unchanged.remindAt.toISOString(),task.remindAt.toISOString());assert.equal(unchanged.scheduleVersion,task.scheduleVersion);assert.match((await p.replyOutbox.findUnique({where:{messageId:source.id}})).text,/dia e horário/);
});
test('reagendamento parcial antigo não sobrescreve compromisso alterado durante interpretação',async()=>{
 const source=await incoming('Reunião do projeto',{status:'completed'});await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Reunião do projeto',datetime:'2099-06-02T12:30:00Z',alertMinutes:[30]}),tx,source.id));
 const appointment=await p.appointment.findUnique({where:{sourceMessageId:source.id}}),message=await incoming('Melhor às dez',{status:'completed'});
 const prepared=await prepareConversation(message,deps(intent('reschedule_appointment',{appointmentId:appointment.id,datetime:'2099-06-09T13:00:00Z'})));assert.equal(prepared.expectedVersion,0);
 const newer=await incoming('Muda para dia cinco',{status:'completed'});await p.$transaction(tx=>executeAppointment(phone,biz,intent('reschedule_appointment',{appointmentId:appointment.id,datetime:'2099-06-05T14:00:00Z'}),tx,newer.id));
 const reply=await p.$transaction(tx=>executeAppointment(phone,biz,prepared,tx,message.id));assert.match(reply,/mudou desde a consulta/);
 const current=await p.appointment.findUnique({where:{id:appointment.id}});assert.equal(current.startsAt.toISOString(),'2099-06-05T14:00:00.000Z');assert.equal(current.version,1);
});
