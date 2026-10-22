require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {subjectOverview}=require('../src/domain/subject.overview.ts');
const {agendaOverview}=require('../src/domain/agenda.overview.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='client-period-'+randomUUID(),other=biz+'other',phone='5557'+String(Date.now()).slice(-9),foreign='5556'+String(Date.now()).slice(-9),now=new Date('2099-06-03T15:00:00Z');
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const create=(title,date,subject='Ana',owner=phone,business=biz,subjectKind='client')=>persistReminder({phone:owner,title,remindAt:date,subject,subjectKind},p,{phoneNumberId:business,limits:{active:100,perDay:100}});
const overview=fields=>p.$transaction(tx=>subjectOverview(phone,biz,intent('subject_overview',{subject:'Ana',...fields}),tx,now));
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,foreign]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});
test('semana de cliente isola pessoa, conta, projeto e outro cliente sem incluir fatos ou notas globais',async()=>{
 const task=await create('Ana início da semana','2099-06-02T12:00:00Z');await create('Ana sexta','2099-06-05T12:00:00Z');await create('Ana próxima semana','2099-06-10T12:00:00Z');
 await create('BRUNO PRIVADO','2099-06-05T12:00:00Z','Bruno');await create('OUTRA PESSOA','2099-06-05T12:00:00Z','Ana',foreign);await create('OUTRA CONTA','2099-06-05T12:00:00Z','Ana',phone,other);await create('PROJETO HOMONIMO','2099-06-05T12:00:00Z','Ana',phone,biz,'project');
 const waiting=await create('Ana esperando','2099-05-30T12:00:00Z');await p.reminder.update({where:{id:waiting.id},data:{taskProgress:'waiting',status:'awaiting_followup'}});
 await p.knowledgeFact.create({data:{subjectId:task.subjectId,key:'orcamento',value:'VALOR GLOBAL',revision:1}});await p.event.create({data:{userId:task.userId,type:'secretary_note',source:'secretaria',payload:{phoneNumberId:biz,text:'Ana NOTA GLOBAL',searchText:'ana nota global'}}});
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Visita Ana',status:'completed'}});await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Visita Ana',subject:'Ana',datetime:'2099-06-04T13:00:00Z',alertMinutes:[60]}),tx,source.id));
 const reply=await overview({agendaPeriod:'week'});assert.match(reply,/Agenda de Ana/);assert.match(reply,/1 compromisso registrado e 2 tarefas pendentes/);assert.match(reply,/Ana sexta/);assert.match(reply,/Ana esperando/);assert.match(reply,/fora do período/);assert.doesNotMatch(reply,/BRUNO PRIVADO|OUTRA PESSOA|OUTRA CONTA|PROJETO HOMONIMO|VALOR GLOBAL|NOTA GLOBAL|Ana próxima semana/);
});
test('intervalo personalizado respeita início inclusivo e fim exclusivo',async()=>{
 await create('NO INICIO','2099-06-04T03:00:00Z');await create('NO FIM EXCLUSIVO','2099-06-06T03:00:00Z');
 const reply=await overview({rangeStart:'2099-06-04T03:00:00Z',rangeEnd:'2099-06-06T03:00:00Z'});assert.match(reply,/NO INICIO/);assert.match(reply,/Ana sexta/);assert.doesNotMatch(reply,/NO FIM EXCLUSIVO|Ana início da semana|Ana próxima semana/);assert.match(reply,/fim exclusivo/);
});
test('cliente e projeto homônimos têm agendas independentes',async()=>{const reply=await overview({subjectKind:'project',agendaPeriod:'week'});assert.match(reply,/PROJETO HOMONIMO/);assert.doesNotMatch(reply,/Ana sexta|Visita Ana|Ana esperando/);});
test('intervalos incompletos, invertidos e maiores que 31 dias pedem correção sem consultar tudo',async()=>{
 for(const fields of [{rangeStart:'2099-06-01T03:00:00Z'},{rangeStart:'2099-06-05T03:00:00Z',rangeEnd:'2099-06-01T03:00:00Z'},{rangeStart:'2099-06-01T03:00:00Z',rangeEnd:'2099-07-03T03:00:00Z'},{rangeStart:'2099-06-01T00:00:00',rangeEnd:'2099-06-02T03:00:00Z'}]){const reply=await overview(fields);assert.match(reply,/31 dias/);assert.doesNotMatch(reply,/Ana sexta/);}
 const mixed=await overview({agendaPeriod:'week',rangeStart:'2099-06-01T03:00:00Z',rangeEnd:'2099-06-03T03:00:00Z'});assert.match(mixed,/Escolha um dos dois/);
 const valid=await overview({rangeStart:'2099-06-01T03:00:00Z',rangeEnd:'2099-07-02T03:00:00Z'});assert.match(valid,/Agenda de Ana/);
});
test('nome inexistente ou parcial não cai na agenda geral',async()=>{
 assert.match(await overview({subject:'Inexistente',agendaPeriod:'week'}),/Não encontrei/);await create('Tarefa João','2099-06-05T12:00:00Z','João Silva');assert.match(await overview({subject:'João',agendaPeriod:'week'}),/nome completo/);
});
test('inbox preserva cliente e período explícitos apesar de resposta livre do modelo',async()=>{
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'O que tenho com a cliente Ana nesta semana?',receivedAt:now,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('conversation',{reply:'Não usar agenda inventada'})},biz);
 const reply=await p.replyOutbox.findUnique({where:{messageId:source.id}});assert.ok(reply);assert.match(reply.text,/Agenda de Ana/);assert.match(reply.text,/Ana sexta/);assert.doesNotMatch(reply.text,/Não usar|BRUNO PRIVADO|PROJETO HOMONIMO/);
 const next=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'O que tenho com ela na próxima semana?',receivedAt:new Date(now.getTime()+1000),nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('agenda_overview',{subject:'Bruno',agendaPeriod:'week'})},biz);
 const follow=await p.replyOutbox.findUnique({where:{messageId:next.id}});assert.ok(follow);assert.match(follow.text,/Agenda de Ana/);assert.match(follow.text,/Ana próxima semana/);assert.doesNotMatch(follow.text,/BRUNO PRIVADO|Ana sexta/);
});
