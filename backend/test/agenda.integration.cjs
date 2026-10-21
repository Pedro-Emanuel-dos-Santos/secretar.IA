require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {agendaOverview}=require('../src/domain/agenda.overview.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='agenda-'+randomUUID(),other=biz+'other',phone='5559'+String(Date.now()).slice(-9),foreign='5558'+String(Date.now()).slice(-9),now=new Date('2099-06-03T15:00:00Z');
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const create=(title,date,owner=phone,business=biz)=>persistReminder({phone:owner,title,remindAt:date},p,{phoneNumberId:business,limits:{active:100,perDay:100}});
const overview=(period='week')=>p.$transaction(tx=>agendaOverview(phone,biz,tx,period,now));
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,foreign]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});
test('agenda combina eventos e avisos sem duplicar alertas e inclui espera fora do período',async()=>{
 await create('Enviar proposta','2099-06-05T12:00:00Z');await create('Anterior pendente','2099-05-30T12:00:00Z');await create('Só próxima semana','2099-06-10T12:00:00Z');
 const waiting=await create('Retorno do fornecedor','2099-05-31T12:00:00Z');await p.reminder.update({where:{id:waiting.id},data:{taskProgress:'waiting',waitingFor:'João',status:'awaiting_followup'}});
 await create('SEGREDO PESSOA','2099-06-05T12:00:00Z',foreign);await create('SEGREDO CONTA','2099-06-05T12:00:00Z',phone,other);
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Visita',status:'completed'}});
 await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Visita Ana',datetime:'2099-06-04T13:00:00Z',alertMinutes:[1440,60]}),tx,source.id));
 const before=await p.reminder.count({where:{user:{phone}}}),reply=await overview();assert.match(reply,/1 compromisso\(s\).*1 tarefa\(s\)/);assert.equal((reply.match(/Visita Ana/g)||[]).length,1);assert.match(reply,/Aviso de tarefa: Enviar proposta/);assert.match(reply,/Retorno do fornecedor/);assert.match(reply,/aguardando João/);assert.doesNotMatch(reply,/SEGREDO|Só próxima semana/);assert.ok(reply.indexOf('Visita Ana')<reply.indexOf('Enviar proposta'));assert.equal(await p.reminder.count({where:{user:{phone}}}),before);
});
test('período seguinte e fim exclusivo não misturam semanas',async()=>{
 await create('Limite exato da semana seguinte','2099-06-08T03:00:00Z');assert.doesNotMatch(await overview(),/Limite exato/);const next=await overview('next_week');assert.match(next,/Limite exato/);assert.match(next,/Só próxima semana/);assert.doesNotMatch(next,/Enviar proposta|Visita Ana/);
});
test('consulta local usa recebimento da mensagem e não chama IA nem muda pausa',async()=>{
 await p.contactPreference.upsert({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}},create:{phoneNumberId:biz,phone,remindersPaused:true},update:{remindersPaused:true}});
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Como está minha semana?',receivedAt:now,nextAttemptAt:new Date(0)}});let calls=0;
 await processInboxBatch(p,{buildContext:async()=>{throw Error('context must not run');},interpret:async()=>{calls++;throw Error('AI must not run');}},biz);
 const reply=await p.replyOutbox.findUnique({where:{messageId:source.id}});assert.ok(reply);assert.match(reply.text,/2099/);assert.match(reply.text,/Visita Ana/);assert.match(reply.text,/avisos estão pausados/);assert.equal(calls,0);assert.equal((await p.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}})).remindersPaused,true);
});
test('muitos itens têm limite de texto, contagem real e aviso de resultados adicionais',async()=>{
 await p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}},data:{remindersPaused:false}});
 for(let i=0;i<12;i++)await create('Longa '+i+' '+ 'x'.repeat(450),'2099-06-06T12:00:00Z');
 const reply=await overview();assert.match(reply,/13 tarefa\(s\)/);assert.match(reply,/Há mais itens/);assert.ok(reply.length<3500);assert.doesNotMatch(reply,/SEGREDO/);
});
test('ação interpretada usa período solicitado e consulta registros reais pelo inbox',async()=>{
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Pode reunir meus compromissos e tarefas da próxima semana?',receivedAt:now,nextAttemptAt:new Date(0)}});let calls=0;
 await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>{calls++;return intent('agenda_overview',{agendaPeriod:'next_week',reply:'Modelo não deve escrever a agenda.'});}},biz);
 const reply=await p.replyOutbox.findUnique({where:{messageId:source.id}});assert.ok(reply);assert.equal(calls,1);assert.match(reply.text,/Próxima semana/);assert.match(reply.text,/Só próxima semana/);assert.doesNotMatch(reply.text,/Enviar proposta|Modelo não deve/);
});
