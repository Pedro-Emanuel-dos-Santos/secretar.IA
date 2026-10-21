require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {subjectOverview}=require('../src/domain/subject.overview.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {shownTaskList}=require('../src/domain/task.selection.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='relink-'+randomUUID(),other=biz+'other',phone='5563'+String(Date.now()).slice(-9),foreign='5562'+String(Date.now()).slice(-9);
const intent=(action,extra={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...extra});
const create=title=>persistReminder({phone,title,remindAt:'2099-06-01T12:00:00Z'},p,{phoneNumberId:biz});
const change=(task,fields={},owner=phone,business=biz)=>p.$transaction(tx=>manageReminders(owner,business,intent('set_task_subject',{reminderId:task.id,...fields}),tx));
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,foreign]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});
test('vincular e trocar cliente mantém horário, progresso, versão e outbox sem reagendar',async()=>{
 const task=await create('Preparar orçamento'),outbox=await p.scheduleOutbox.findUnique({where:{reminderId:task.id}});
 assert.match(await change(task,{subject:'Ana'}),/Vinculei/);const linked=await p.reminder.findUnique({where:{id:task.id}});assert.ok(linked.subjectId);
 assert.equal(linked.remindAt.toISOString(),task.remindAt.toISOString());assert.equal(linked.scheduleVersion,task.scheduleVersion);assert.equal(linked.status,task.status);assert.equal(linked.taskProgress,task.taskProgress);
 assert.deepEqual(await p.scheduleOutbox.findUnique({where:{reminderId:task.id}}),outbox);
 assert.match(await change(task,{subject:'Bruno',expectedSubjectId:linked.subjectId}),/Bruno/);
 const overview=await p.$transaction(tx=>subjectOverview(phone,biz,intent('subject_overview',{subject:'Bruno'}),tx));assert.match(overview,/Preparar orçamento/);
});
test('repetir vínculo é no-op e desvincular não apaga cadastro nem dados',async()=>{
 const task=await create('Revisar proposta');await change(task,{subject:'Ana'});const before=await p.event.count({where:{type:'task_subject_changed',payload:{path:['reminderId'],equals:task.id}}});
 assert.match(await change(task,{subject:'Ana'}),/já está vinculada/);assert.equal(await p.event.count({where:{type:'task_subject_changed',payload:{path:['reminderId'],equals:task.id}}}),before);
 assert.match(await change(task,{clearSubject:true}),/Retirei/);assert.equal((await p.reminder.findUnique({where:{id:task.id}})).subjectId,null);assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Ana'}}),1);
 assert.match(await change(task,{clearSubject:true}),/já está sem/);
});
test('vínculo é isolado por pessoa e número comercial e recusa nome parcial',async()=>{
 const task=await create('Pendência privada');assert.match(await change(task,{subject:'Vazamento'},foreign),/Não encontrei/);assert.match(await change(task,{subject:'Vazamento'},phone,other),/Não encontrei/);
 await change(task,{subject:'João Silva'});assert.match(await change(task,{subject:'João'}),/nome completo/);assert.equal(await p.businessSubject.count({where:{name:'Vazamento',phoneNumberId:{in:[biz,other]}}}),0);
 assert.equal((await p.businessSubject.findUnique({where:{id:(await p.reminder.findUnique({where:{id:task.id}})).subjectId}})).name,'João Silva');
});
test('envio incerto, versão ou vínculo antigo bloqueiam mudança sem criar cadastro',async()=>{
 const task=await create('Não alterar em voo');for(const status of ['sending','delivery_unknown']){await p.reminder.update({where:{id:task.id},data:{status}});assert.match(await change(task,{subject:'Bloqueado'}),/Aguarde/);}
 await p.reminder.update({where:{id:task.id},data:{status:'scheduling_pending'}});
 assert.match(await change(task,{subject:'Bloqueado',expectedVersion:99}),/mudou/);assert.match(await change(task,{subject:'Bloqueado',expectedSubjectId:'old-id'}),/mudou/);assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Bloqueado'}}),0);
});
test('falha no commit desfaz cadastro e vínculo juntos',async()=>{
 const task=await create('Rollback vínculo');await assert.rejects(p.$transaction(async tx=>{await manageReminders(phone,biz,intent('set_task_subject',{reminderId:task.id,subject:'Cliente rollback'}),tx);throw Error('rollback');}),/rollback/);
 assert.equal((await p.reminder.findUnique({where:{id:task.id}})).subjectId,null);assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Cliente rollback'}}),0);
});
test('aviso de compromisso não recebe vínculo independente da tarefa',async()=>{
 const task=await create('Aviso de compromisso'),appointment=await p.appointment.create({data:{userId:task.userId,phoneNumberId:biz,title:'Visita',startsAt:task.remindAt}});
 await p.reminder.update({where:{id:task.id},data:{appointmentId:appointment.id}});assert.match(await change(task,{subject:'Cliente indevido'}),/próprio compromisso/);assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'Cliente indevido'}}),0);
});
test('preparação exige nome explícito e obtém vínculo esperado do contexto confiável',async()=>{
 const task=await create('Corrigir cliente');const message={phone,phoneNumberId:biz,text:'Essa tarefa é da Ana',receivedAt:new Date()},context={reminders:[task]};
 const prepare=text=>prepareConversation({...message,text},{buildContext:async()=>context,interpret:async()=>intent('set_task_subject',{reminderId:task.id,subject:'Ana',expectedSubjectId:'forged',expectedVersion:99})});
 const prepared=await prepare(message.text);assert.equal(prepared.expectedVersion,task.scheduleVersion);assert.equal(prepared.expectedSubjectId,null);
 assert.equal((await prepare('Corrige o cliente dela')).action,'conversation');
 const removal=await prepareConversation(message,{buildContext:async()=>context,interpret:async()=>intent('set_task_subject',{reminderId:task.id,clearSubject:true})});assert.equal(removal.action,'conversation');
 const negative=await prepareConversation({...message,text:'Não tira o cliente dessa tarefa'},{buildContext:async()=>context,interpret:async()=>intent('set_task_subject',{reminderId:task.id,clearSubject:true})});assert.equal(negative.action,'conversation');
});
test('mudança de cliente invalida snapshot antigo sem invalidar o job',async()=>{
 const task=await create('Alvo selecionado');const source=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Lista minhas tarefas',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('list_reminders')},biz);await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);
 const list=await shownTaskList(p,phone,biz,new Date()),index=list.items.findIndex(item=>item.id===task.id);assert.ok(index>=0);await change(task,{subject:'Ana'});
 const result=await p.$transaction(tx=>manageReminders(phone,biz,intent('complete_reminder',{reminderId:task.id,selectionListId:list.id,selectionIndex:index,expectedVersion:task.scheduleVersion}),tx));assert.match(result,/mudou/);assert.equal((await p.reminder.findUnique({where:{id:task.id}})).state,'active');
});
