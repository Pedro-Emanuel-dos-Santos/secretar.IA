require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts');
const {dayOverview}=require('../src/domain/day.overview.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {operationalOverview}=require('../src/domain/operations.overview.ts');
const p=createPrismaClient(require('./integration.database.cjs')),business='task-progress-'+randomUUID(),phone='5581'+String(Date.now()).slice(-9),other='5580'+String(Date.now()).slice(-9);
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const make=title=>persistReminder({phone,title,remindAt:'2099-06-01T10:00:00-03:00'},p,{phoneNumberId:business});
const run=(action,fields={},owner=phone,biz=business)=>p.$transaction(tx=>manageReminders(owner,biz,intent(action,fields),tx));
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,other]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.contactPreference.deleteMany({where:{phoneNumberId:business}});await p.$disconnect();});
test('aguardar suspende aviso antigo sem concluir tarefa e consulta distingue atrasadas',async()=>{
 const r=await make('Cobrar João');
 assert.match(await run('mark_waiting',{reminderId:r.id,waitingFor:'João'}),/Não agendei um novo aviso/);
 const saved=await p.reminder.findUniqueOrThrow({where:{id:r.id},include:{scheduleOutbox:true}});
 assert.equal(saved.taskProgress,'waiting');assert.equal(saved.state,'active');assert.equal(saved.waitingFor,'João');assert.equal(saved.scheduleOutbox.status,'cancelled');assert.equal(saved.scheduleVersion,1);
 assert.equal(await deliverReminder(r.id,business,p,()=>assert.fail('Não deve enviar'),0),'stale');
 assert.match(await run('list_reminders',{taskFilter:'waiting'}),/Cobrar João/);
 assert.doesNotMatch(await run('list_reminders',{taskFilter:'overdue'}),/Cobrar João/);
 const summary=await p.$transaction(tx=>dayOverview(phone,business,tx,new Date('2099-06-02T15:00:00Z')));assert.match(summary,/1 tarefa aguardando resposta/);assert.doesNotMatch(summary,/pendências? de dias anteriores/);
 assert.match(await run('complete_reminder',{reminderId:r.id}),/concluído/);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).taskProgress,'completed');
 assert.match(await run('list_reminders',{taskFilter:'completed'}),/Cobrar João/);
});
test('espera com aviso explícito agenda, pausa bloqueia e retomada por horário volta a pendente',async()=>{
 const r=await make('Aprovar orçamento');
 await p.contactPreference.create({data:{phoneNumberId:business,phone,remindersPaused:true}});
 assert.match(await run('mark_waiting',{reminderId:r.id,waitingFor:'cliente',datetime:'2099-06-02T09:00:00-03:00'}),/pausados/);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).taskProgress,'pending');
 await p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:business,phone}},data:{remindersPaused:false}});
 assert.match(await run('mark_waiting',{reminderId:r.id,waitingFor:'cliente',datetime:'2099-06-02T09:00:00-03:00'}),/Novo aviso/);
 let saved=await p.reminder.findUniqueOrThrow({where:{id:r.id},include:{scheduleOutbox:true}});assert.equal(saved.taskProgress,'waiting');assert.equal(saved.scheduleOutbox.status,'pending');assert.equal(saved.remindAt.toISOString(),'2099-06-02T12:00:00.000Z');
 await run('reschedule_reminder',{reminderId:r.id,datetime:'2099-06-03T09:00:00-03:00'});saved=await p.reminder.findUniqueOrThrow({where:{id:r.id}});assert.equal(saved.taskProgress,'pending');assert.equal(saved.waitingFor,null);
});
test('espera rejeita outra pessoa, outra conta, data inválida e envio incerto',async()=>{
 const r=await make('Responder proposta');
 assert.match(await run('mark_waiting',{reminderId:r.id},other),/Não encontrei/);
 assert.match(await run('mark_waiting',{reminderId:r.id},phone,business+'other'),/Não encontrei/);
 assert.match(await run('mark_waiting',{reminderId:r.id,datetime:'invalida'}),/válidos no futuro/);
 await p.reminder.update({where:{id:r.id},data:{status:'delivery_unknown'}});
 assert.match(await run('mark_waiting',{reminderId:r.id}),/sem confirmação/);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).taskProgress,'pending');
});
test('filtro de concluídas por data usa conclusão e preserva isolamento de conta',async()=>{
 const r=await make('Concluída hoje');await run('complete_reminder',{reminderId:r.id});
 const from=new Date(Date.now()-60000).toISOString(),to=new Date(Date.now()+60000).toISOString();
 assert.match(await run('list_reminders',{taskFilter:'completed',rangeStart:from,rangeEnd:to}),/Concluída hoje/);
 assert.doesNotMatch(await run('list_reminders',{taskFilter:'completed',rangeStart:from,rangeEnd:to},phone,business+'other'),/Concluída hoje/);
});
test('espera e resposta são atômicas no inbox; reprocessar não duplica evento',async()=>{
 const r=await make('Cobrar aprovação');
 const row=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'Já cobrei, agora espero Ana',nextAttemptAt:new Date(0)}});
 const deps={buildContext:async()=>({}),interpret:async()=>intent('mark_waiting',{reminderId:r.id,waitingFor:'Ana'})};
 await Promise.all([processInboxBatch(p,deps,business),processInboxBatch(p,deps,business)]);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}});assert.match(saved.reply.text,/aguardando Ana/);
 assert.equal(await p.event.count({where:{type:'task_waiting',payload:{path:['reminderId'],equals:r.id}}}),1);
});
test('contexto oferece aviso recente sem confundir aceitação com entrega e sem outra conta',async()=>{
 const r=await make('Aviso recente da própria conta'),foreign=await make('Aviso PRIVADO');
 await p.reminder.update({where:{id:r.id},data:{status:'provider_accepted',deliveryStartedAt:new Date(Date.now()-1000),deliveryStatus:'read'}});
 await p.scheduleOutbox.update({where:{reminderId:foreign.id},data:{phoneNumberId:business+'other'}});
 await p.reminder.update({where:{id:foreign.id},data:{status:'provider_accepted',deliveryStartedAt:new Date(),deliveryStatus:'read'}});
 const c=await conversationContext(p,{phone,phoneNumberId:business,text:'Já fiz',receivedAt:new Date()});
 assert.equal(c.conversationState.latestReminderNotice.id,r.id);assert.equal(c.conversationState.latestReminderNotice.deliveryStatus,'read');assert.equal(c.recentAlerts.some(a=>a.id===foreign.id),false);
});
test('correção de título preserva horário e invalida job anterior',async()=>{
 const r=await make('Cobrar João');
 assert.match(await run('edit_reminder',{reminderId:r.id,newTitle:'Cobrar Maria'}),/Corrigi/);
 const saved=await p.reminder.findUniqueOrThrow({where:{id:r.id},include:{scheduleOutbox:true}});
 assert.equal(saved.title,'Cobrar Maria');assert.equal(saved.remindAt.getTime(),r.remindAt.getTime());assert.equal(saved.scheduleVersion,1);assert.equal(saved.scheduleOutbox.status,'pending');
 assert.equal(await deliverReminder(r.id,business,p,()=>assert.fail(),0),'stale');
});
test('corrigir título de aviso aceito não agenda novo envio e recusa envio incerto',async()=>{
 const r=await make('Proposta antiga');await p.reminder.update({where:{id:r.id},data:{status:'provider_accepted',providerMessageId:'wamid.fictional-title'}});await p.scheduleOutbox.update({where:{reminderId:r.id},data:{status:'published'}});
 assert.match(await run('edit_reminder',{reminderId:r.id,newTitle:'Proposta corrigida'}),/não agendei outro envio/);
 const saved=await p.reminder.findUniqueOrThrow({where:{id:r.id},include:{scheduleOutbox:true}});assert.equal(saved.status,'provider_accepted');assert.equal(saved.providerMessageId,'wamid.fictional-title');assert.equal(saved.scheduleOutbox.status,'published');
 assert.match(await run('edit_reminder',{reminderId:r.id,newTitle:'Privado'},other),/Não encontrei/);
 await p.reminder.update({where:{id:r.id},data:{status:'delivery_unknown'}});
 assert.match(await run('edit_reminder',{reminderId:r.id,newTitle:'Não alterar'}),/não foi confirmado/);
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).title,'Proposta corrigida');
});
test('operação expõe contagens de progresso sem texto de cliente',async()=>{
 const overview=await operationalOverview(p,business);
 assert.ok(overview.taskProgress.waiting>=1);assert.ok(overview.taskProgress.completed>=1);
 assert.equal(JSON.stringify(overview).includes('João'),false);assert.equal(JSON.stringify(overview).includes(phone),false);
});
