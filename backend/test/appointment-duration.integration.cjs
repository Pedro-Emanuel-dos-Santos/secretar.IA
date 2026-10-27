require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {exportCalendar}=require('../src/domain/calendar.export.ts');
const {agendaOverview}=require('../src/domain/agenda.overview.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {localCalendarParts,localCalendarInstant}=require('../src/domain/recurrence.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='duration-'+randomUUID(),phones=[];
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const owner=()=>{const phone='5562'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);return phone;};
async function call(phone,action,fields={},account=biz){const m=await p.incomingMessage.create({data:{phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'Pedido explícito',status:'completed'}});const reply=await p.$transaction(tx=>executeAppointment(phone,account,intent(action,fields),tx,m.id));return {m,reply,record:await p.appointment.findUnique({where:{sourceMessageId:m.id}})};}
const create=(phone,start='2099-06-02T12:00:00Z',duration=60,account=biz)=>call(phone,'create_appointment',{title:'Reunião',datetime:start,durationMinutes:duration,alertMinutes:[30,0]},account);
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});
test('duração salva término e exporta o mesmo intervalo sem alterar avisos',async()=>{
 const phone=owner(),{record}=await create(phone);assert.equal(record.endsAt.toISOString(),'2099-06-02T13:00:00.000Z');
 const alerts=await p.reminder.findMany({where:{appointmentId:record.id}});assert.equal(alerts.length,2);assert.deepEqual(alerts.map(r=>(record.startsAt-r.remindAt)/60000).sort((a,b)=>a-b),[0,30]);
 assert.match(await exportCalendar(p,phone,biz,new Date('2099-06-02'),new Date('2099-06-03')),/DTEND:20990602T130000Z/);
});
test('sobreposição não cria evento/avisos e intervalo adjacente é permitido',async()=>{
 const phone=owner();await create(phone);const before=await p.reminder.count({where:{user:{phone}}});
 const conflict=await create(phone,'2099-06-02T12:30:00Z');assert.equal(conflict.record,null);assert.match(conflict.reply,/sobrepõe/);assert.equal(await p.reminder.count({where:{user:{phone}}}),before);
 assert.ok((await create(phone,'2099-06-02T13:00:00Z')).record);
});
test('reagendamento preserva duração e antecedências; conflito mantém agendamento original',async()=>{
 const phone=owner(),{record}=await create(phone);await create(phone,'2099-06-02T15:00:00Z');
 const conflict=await call(phone,'reschedule_appointment',{appointmentId:record.id,datetime:'2099-06-02T15:30:00Z'});assert.match(conflict.reply,/sobrepõe/);
 const unchanged=await p.appointment.findUnique({where:{id:record.id}});assert.equal(unchanged.version,0);assert.equal(unchanged.startsAt.toISOString(),record.startsAt.toISOString());
 await call(phone,'reschedule_appointment',{appointmentId:record.id,datetime:'2099-06-03T12:00:00Z'});
 const changed=await p.appointment.findUnique({where:{id:record.id}});assert.equal(changed.endsAt.toISOString(),'2099-06-03T13:00:00.000Z');assert.equal(changed.version,1);
 const active=await p.reminder.findMany({where:{appointmentId:record.id,state:'active'}});assert.deepEqual(active.map(r=>(changed.startsAt-r.remindAt)/60000).sort((a,b)=>a-b),[0,30]);
});

test('correção real de relógio com offset incorreto preserva compromisso único, duração e avisos',async()=>{
 const phone=owner(),zone='America/Sao_Paulo',date=localCalendarParts(new Date(Date.now()+2*86400000),zone).slice(0,3);
 const start=localCalendarInstant([...date,9,0,0],zone),expected=localCalendarInstant([...date,10,0,0],zone),wrong=localCalendarInstant([...date,13,0,0],zone);
 const {record}=await call(phone,'create_appointment',{title:'Reunião',datetime:start.toISOString(),durationMinutes:60,alertMinutes:[15]});
 const context={user:{timezone:zone},appointments:[record],conversationState:{focusedAppointment:record}};
 const interpreted=await prepareConversation({phone,phoneNumberId:biz,text:'Melhor às dez',receivedAt:new Date()},{buildContext:async()=>context,interpret:async()=>intent('create_appointment',{title:'Reunião',datetime:wrong.toISOString()})});
 assert.equal(interpreted.action,'reschedule_appointment');assert.equal(interpreted.appointmentId,record.id);assert.equal(interpreted.expectedVersion,0);assert.equal(interpreted.datetime,expected.toISOString());
 await call(phone,interpreted.action,interpreted);
 const changed=await p.appointment.findUnique({where:{id:record.id}});
 assert.equal(await p.appointment.count({where:{user:{phone},phoneNumberId:biz}}),1);assert.equal(changed.version,1);assert.equal(changed.startsAt.toISOString(),expected.toISOString());assert.equal(changed.endsAt-changed.startsAt,3600000);
 const alerts=await p.reminder.findMany({where:{appointmentId:record.id,state:'active'}});assert.equal(alerts.length,1);assert.equal(alerts[0].remindAt.toISOString(),new Date(expected.getTime()-15*60000).toISOString());assert.deepEqual(alerts.map(r=>(changed.startsAt-r.remindAt)/60000),[15]);
});
test('conflitos ignoram outra pessoa/conta e eventos cancelados',async()=>{
 const phone=owner(),other=owner();await create(other);await create(phone,'2099-06-02T12:00:00Z',60,biz+'other');
 const mine=await create(phone);assert.ok(mine.record);await call(phone,'cancel_appointment',{appointmentId:mine.record.id});assert.ok((await create(phone)).record);
});
test('concorrência no mesmo contato não permite dois intervalos sobrepostos',async()=>{
 const phone=owner();await p.user.create({data:{phone}});const result=await Promise.all([create(phone),create(phone)]);assert.equal(result.filter(r=>r.record).length,1);assert.equal(result.filter(r=>/sobrepõe/.test(r.reply)).length,1);
});
test('nova duração no mesmo horário não vira falso no-op; mudar aviso preserva término',async()=>{
 const phone=owner(),{record}=await create(phone);await call(phone,'reschedule_appointment',{appointmentId:record.id,datetime:record.startsAt.toISOString(),durationMinutes:90});
 assert.equal((await p.appointment.findUnique({where:{id:record.id}})).endsAt.toISOString(),'2099-06-02T13:30:00.000Z');
 await call(phone,'set_appointment_alerts',{appointmentId:record.id,alertMinutes:[10]});assert.equal((await p.appointment.findUnique({where:{id:record.id}})).endsAt.toISOString(),'2099-06-02T13:30:00.000Z');
});
test('rascunho em dois turnos conserva duração até informar a hora',async()=>{
 const phone=owner(),receivedAt=new Date('2099-06-01T15:00:00Z');
 const first=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Reunião amanhã por uma hora',receivedAt,nextAttemptAt:new Date(0)}});
 const deps={buildContext:m=>conversationContext(p,m),interpret:async()=>intent('create_appointment',{title:'Reunião',datetime:'2099-06-02T12:00:00Z'})};await processInboxBatch(p,deps,biz);assert.equal(await p.appointment.count({where:{user:{phone}}}),0);
 await p.replyOutbox.update({where:{messageId:first.id},data:{status:'provider_accepted',finishedAt:receivedAt}});
 const next=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Às nove',receivedAt:new Date(receivedAt.getTime()+60000),nextAttemptAt:new Date(0)}});await processInboxBatch(p,deps,biz);
 const saved=await p.appointment.findUnique({where:{sourceMessageId:next.id}});assert.equal(saved.endsAt.getTime()-saved.startsAt.getTime(),3600000);
});
test('compromisso atravessando meia-noite aparece no dia seguinte com data de início',async()=>{
 const phone=owner();await create(phone,'2099-06-03T02:00:00Z',120);
 const agenda=await p.$transaction(tx=>agendaOverview(phone,biz,tx,'today',new Date('2099-06-03T15:00:00Z')));
 assert.match(agenda,/02\/06.*23:00.*até.*01:00/);assert.match(agenda,/1 compromisso/);
});
