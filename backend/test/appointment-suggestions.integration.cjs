require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {shownAppointmentSuggestions}=require('../src/domain/appointment.suggestions.ts');
const {appointmentAlternatives}=require('../src/domain/appointment.slots.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='suggestions-'+randomUUID(),phones=[];
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const owner=()=>{const phone='5578'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);return phone;};
const incoming=(phone,text,extra={})=>p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0),...extra}});
async function direct(phone,title,datetime,durationMinutes=60){const m=await incoming(phone,'Pedido',{status:'completed'});await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title,datetime,durationMinutes,alertMinutes:[0]}),tx,m.id));return p.appointment.findUnique({where:{sourceMessageId:m.id}});}
const deps=i=>({buildContext:m=>conversationContext(p,m),interpret:async()=>i});
async function setup(send=true){const phone=owner();await direct(phone,'Já marcado','2099-06-01T12:00:00Z');const source=await incoming(phone,'Consulta em 2099-06-01 às nove por uma hora');await processInboxBatch(p,deps(intent('create_appointment',{title:'Consulta original',datetime:'2099-06-01T12:00:00Z',durationMinutes:60,alertMinutes:[30]})),biz);if(send)await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);return {phone,source,suggestions:await shownAppointmentSuggestions(p,phone,biz,new Date())};}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:biz}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});
test('conflito propõe horários sem marcar; escolha recupera título, duração e avisos originais',async()=>{
 const {phone,source,suggestions}=await setup();assert.equal(suggestions.items.length,3);assert.equal(await p.appointment.count({where:{user:{phone},phoneNumberId:biz}}),1);
 assert.match((await p.replyOutbox.findUnique({where:{messageId:source.id}})).text,/Qual opção/);
 const choice=await incoming(phone,'A segunda opção');await processInboxBatch(p,deps(intent('conversation',{title:'Inventado',alertMinutes:[999]})),biz);
 const saved=await p.appointment.findUnique({where:{sourceMessageId:choice.id},include:{reminders:{where:{state:'active'}}}});
 assert.equal(saved.title,'Consulta original');assert.equal(saved.startsAt.toISOString(),suggestions.items[1].startsAt);assert.equal(saved.endsAt-saved.startsAt,3600000);assert.deepEqual(saved.reminders.map(r=>r.appointmentOffsetMinutes),[30]);
 assert.equal(await p.event.count({where:{id:suggestions.id}}),0);
});
test('opções pendentes, expiradas e de outro contato/conta não autorizam escolha',async()=>{
 const pending=await setup(false);assert.equal(pending.suggestions,null);
 const sent=await setup();assert.equal(await shownAppointmentSuggestions(p,owner(),biz,new Date()),null);assert.equal(await shownAppointmentSuggestions(p,sent.phone,biz+'other',new Date()),null);
 await p.event.update({where:{id:sent.suggestions.id},data:{createdAt:new Date(Date.now()-16*60000)}});assert.equal(await shownAppointmentSuggestions(p,sent.phone,biz,new Date()),null);
});
test('ocupação nova na opção escolhida impede marcação e gera novas alternativas',async()=>{
 const {phone,suggestions}=await setup();await direct(phone,'Novo conflito',suggestions.items[1].startsAt);
 const choice=await incoming(phone,'Opção 2');await processInboxBatch(p,deps(intent('conversation')),biz);
 assert.equal(await p.appointment.findUnique({where:{sourceMessageId:choice.id}}),null);assert.match((await p.replyOutbox.findUnique({where:{messageId:choice.id}})).text,/sobrepõe/);assert.equal(await p.event.count({where:{id:suggestions.id}}),0);
});
test('duas escolhas concorrentes não reutilizam o mesmo pedido original',async()=>{
 const {phone,suggestions}=await setup();const a=await incoming(phone,'opção 1',{status:'completed'}),b=await incoming(phone,'opção 2',{status:'completed'});
 const choose=index=>({...suggestions.request,datetime:suggestions.items[index].startsAt,appointmentSuggestionId:suggestions.id,appointmentSuggestionIndex:index});
 const replies=await Promise.all([p.$transaction(tx=>executeAppointment(phone,biz,choose(0),tx,a.id)),p.$transaction(tx=>executeAppointment(phone,biz,choose(1),tx,b.id))]);
 assert.equal(replies.filter(r=>/Anotei/.test(r)).length,1);assert.equal(replies.filter(r=>/expiraram/.test(r)).length,1);assert.equal(await p.appointment.count({where:{user:{phone}}}),2);
});
test('rollback devolve opção consumida e desfaz marcação',async()=>{
 const {phone,suggestions}=await setup(),source=await incoming(phone,'opção 1',{status:'completed'}),selected={...suggestions.request,datetime:suggestions.items[0].startsAt,appointmentSuggestionId:suggestions.id,appointmentSuggestionIndex:0};
 await assert.rejects(p.$transaction(async tx=>{await executeAppointment(phone,biz,{...selected},tx,source.id);throw Error('rollback');}));
 assert.ok(await p.event.findUnique({where:{id:suggestions.id}}));assert.equal(await p.appointment.findUnique({where:{sourceMessageId:source.id}}),null);
});
test('nova resposta enviada encerra opções anteriores',async()=>{
 const {phone}=await setup();await incoming(phone,'Outro assunto');await processInboxBatch(p,deps(intent('conversation',{reply:'Entendi.'})),biz);await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);assert.equal(await shownAppointmentSuggestions(p,phone,biz,new Date()),null);
});
test('busca respeita término desconhecido e não ultrapassa o dia local',async()=>{
 const phone=owner();await direct(phone,'Sem término','2099-06-01T15:00:00Z',undefined);
 // Remove end to represent an older appointment without known duration.
 await p.appointment.updateMany({where:{user:{phone}},data:{endsAt:null}});
 const slots=await p.$transaction(tx=>appointmentAlternatives(tx,phone,biz,new Date('2099-06-01T14:00:00Z'),3600000,'America/Sao_Paulo'));
 assert.equal(slots.length,1);assert.equal(slots[0].endsAt.toISOString(),'2099-06-01T15:00:00.000Z');
});
test('escolha não sobrescreve compromisso reagendado depois da proposta',async()=>{
 const phone=owner();await direct(phone,'Bloqueio','2099-06-01T12:00:00Z');const target=await direct(phone,'Visita','2099-06-01T18:00:00Z');
 await incoming(phone,'Muda a visita para 2099-06-01 às nove');await processInboxBatch(p,deps(intent('reschedule_appointment',{appointmentId:target.id,datetime:'2099-06-01T12:00:00Z'})),biz);await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);
 assert.ok(await shownAppointmentSuggestions(p,phone,biz,new Date()));
 await p.appointment.update({where:{id:target.id},data:{startsAt:new Date('2099-06-02T18:00:00Z'),endsAt:new Date('2099-06-02T19:00:00Z'),version:{increment:1}}});
 const choice=await incoming(phone,'Primeira opção');await processInboxBatch(p,deps(intent('conversation')),biz);
 assert.match((await p.replyOutbox.findUnique({where:{messageId:choice.id}})).text,/mudou/);assert.equal((await p.appointment.findUnique({where:{id:target.id}})).startsAt.toISOString(),'2099-06-02T18:00:00.000Z');
});
