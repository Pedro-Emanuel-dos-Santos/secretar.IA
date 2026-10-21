require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder,persistReminderInTransaction}=require('../src/domain/reminder.creator.ts');
const {subjectOverview}=require('../src/domain/subject.overview.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='task-subject-'+randomUUID(),other=biz+'other',phone='5565'+String(Date.now()).slice(-9),foreign='5564'+String(Date.now()).slice(-9);
const intent=(action,extra={})=>({action,reply:'interno',title:null,description:null,datetime:null,amount:null,category:null,...extra});
const create=(fields={},owner=phone,business=biz)=>persistReminder({phone:owner,title:'Preparar proposta',remindAt:'2099-06-01T12:00:00Z',...fields},p,{phoneNumberId:business,limits:{active:100,perDay:100}});
const overview=(name='Ana',business=biz)=>p.$transaction(tx=>subjectOverview(phone,business,intent('subject_overview',{subject:name}),tx));
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,foreign]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});

test('tarefa cria cadastro explicitamente nomeado e série preserva mesmo vínculo',async()=>{
 const r=await create({subject:'Ana',recurrence:{frequency:'daily',count:3}});
 assert.ok(r.subjectId);assert.equal(r.subject.name,'Ana');
 const series=await p.reminder.findMany({where:{seriesId:r.seriesId}});assert.equal(series.length,3);assert.ok(series.every(row=>row.subjectId===r.subjectId));
 assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Ana'}}),1);
});
test('mesmo nome fica isolado por pessoa, conta e tipo cliente/projeto',async()=>{
 const own=await create({subject:'Ana'}),otherAccount=await create({subject:'Ana'},phone,other),otherPerson=await create({subject:'Ana'},foreign),project=await create({subject:'Ana',subjectKind:'project'});
 assert.equal(new Set([own.subjectId,otherAccount.subjectId,otherPerson.subjectId,project.subjectId]).size,4);
});
test('nome parcial de cadastro conhecido não cria tarefa nem cadastro duplicado',async()=>{
 await create({subject:'João Silva'});const before=await p.reminder.count({where:{user:{phone}}});
 await assert.rejects(create({subject:'João'}),error=>/nome completo/.test(error.reply));
 assert.equal(await p.reminder.count({where:{user:{phone}}}),before);assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'João'}}),0);
});
test('visão do cliente mostra pendentes e espera, exclui concluídas e títulos sem vínculo',async()=>{
 const waiting=await create({title:'Aguardar aprovação',subject:'Ana'});await p.reminder.update({where:{id:waiting.id},data:{taskProgress:'waiting',waitingFor:'Ana'}});
 const done=await create({title:'CONCLUIDA OCULTA',subject:'Ana'});await p.reminder.update({where:{id:done.id},data:{state:'completed',taskProgress:'completed'}});
 await create({title:'SEM VINCULO Ana'});await create({title:'PRIVADO OUTRA CONTA',subject:'Ana'},phone,other);
 const reply=await overview();assert.match(reply,/Tarefas pendentes vinculadas/);assert.match(reply,/Aguardar aprovação/);assert.match(reply,/aguardando Ana/);assert.doesNotMatch(reply,/CONCLUIDA OCULTA|SEM VINCULO|PRIVADO/);
 const list=await p.$transaction(tx=>manageReminders(phone,biz,intent('list_reminders',{subject:'Ana',taskFilter:'waiting'}),tx));assert.match(list,/Aguardar aprovação/);assert.doesNotMatch(list,/SEM VINCULO|PRIVADO/);
});
test('rollback desfaz cadastro, tarefa e outbox juntos',async()=>{
 await assert.rejects(p.$transaction(async tx=>{await persistReminderInTransaction({phone,title:'Rollback',subject:'Cliente rollback',remindAt:'2099-06-01T12:00:00Z'},tx,{phoneNumberId:biz,limits:{active:100,perDay:100}});throw Error('rollback');}),/rollback/);
 assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Cliente rollback'}}),0);assert.equal(await p.reminder.count({where:{user:{phone},title:'Rollback'}}),0);
});
test('aviso inclui cliente, mantém controles e aceitação não conclui tarefa',async()=>{
 const task=await create({subject:'Ana',title:'Enviar proposta final'});let sent;
 const status=await deliverReminder(task.id,biz,p,async(_,text,controls)=>{sent={text,controls};return {messages:[{id:randomUUID()}]}});
 assert.equal(status,'provider_accepted');assert.match(sent.text,/Enviar proposta final \(Ana\)/);assert.equal(sent.controls.id,task.id);
 const stored=await p.reminder.findUnique({where:{id:task.id}});assert.equal(stored.state,'active');assert.equal(stored.taskProgress,'pending');
});
test('modelo não pode copiar cliente anterior para tarefa sem menção explícita',async()=>{
 const prepared=await prepareConversation({phone,phoneNumberId:biz,text:'Me lembra de beber água daqui a um minuto',receivedAt:new Date()},{buildContext:async()=>({conversationState:{focusedSubject:{name:'Ana',kind:'client'}}}),interpret:async()=>intent('create_reminder',{title:'Beber água',subject:'Ana',datetime:'2099-06-01T12:00:00Z'})});
 assert.equal(prepared.action,'conversation');assert.match(prepared.reply,/nome do cliente/);
});
test('rascunho preserva cliente ao completar horário e resposta enviada mantém vínculo',async()=>{
 const first=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Me lembra amanhã de enviar orçamento para Camila',nextAttemptAt:new Date(0)}});
 const deps={buildContext:m=>conversationContext(p,m),interpret:async context=>context.currentMessage.startsWith('Me lembra')?intent('create_reminder',{title:'Enviar orçamento',subject:'Camila',draft:{date:'2099-06-01',time:null}}):intent('create_reminder',{title:'Enviar orçamento',subject:'Camila',datetime:'2099-06-01T12:00:00Z'})};
 await processInboxBatch(p,deps,biz);assert.equal(await p.reminder.count({where:{sourceMessageId:first.id}}),0);
 const second=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Às nove da manhã',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,deps,biz);const task=await p.reminder.findUnique({where:{sourceMessageId:second.id},include:{subject:true}});assert.ok(task);assert.equal(task.subject.name,'Camila');
 const sends=[];await relayReplies(p,async(_,text)=>{sends.push(text);return {messages:[{id:randomUUID()}]}},biz);assert.ok(sends.some(text=>text.includes('(Camila)')));
 await processInboxBatch(p,deps,biz);assert.equal(await p.reminder.count({where:{sourceMessageId:second.id}}),1);
});
