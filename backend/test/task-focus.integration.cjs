require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {shownTaskFocus}=require('../src/domain/task.selection.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='focus-'+randomUUID(),other=biz+'other',phones=[];
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const deps=action=>({buildContext:m=>conversationContext(p,m),interpret:async()=>intent(action,{reminderId:'model-guess',search:'wrong title'})});
const incoming=(phone,text)=>p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0)}});
const send=()=>relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);
async function setup(accept=true){
 const phone='55'+String(Date.now()).slice(-10)+phones.length;phones.push(phone);
 const first=await persistReminder({phone,title:'Primeira tarefa',remindAt:'2099-06-01T12:00:00Z'},p,{phoneNumberId:biz}),second=await persistReminder({phone,title:'Segunda tarefa',remindAt:'2099-06-02T12:00:00Z'},p,{phoneNumberId:biz});
 await incoming(phone,'Lista minhas tarefas');await processInboxBatch(p,{...deps('list_reminders'),interpret:async()=>intent('list_reminders')},biz);await send();
 const selection=await incoming(phone,'o segundo');await processInboxBatch(p,deps('conversation'),biz);if(accept)await send();
 return {phone,first,second,selection};
}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});
test('lista, o segundo, pode concluir: referência persistida altera somente o selecionado',async()=>{
 const {phone,first,second}=await setup();assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');const focus=await shownTaskFocus(p,phone,biz,new Date());assert.equal(focus.list.items[focus.index].id,second.id);
 const message=await incoming(phone,'pode concluir');await processInboxBatch(p,deps('complete_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'completed');assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');assert.equal(await shownTaskFocus(p,phone,biz,new Date()),null);
 const stored=await p.incomingMessage.findUnique({where:{id:message.id}});assert.equal(stored.interpretation.reminderId,second.id);assert.equal(stored.interpretation.selectionFocusId,focus.id);
 await processInboxBatch(p,deps('complete_reminder'),biz);assert.equal(await p.replyOutbox.count({where:{messageId:message.id}}),1);
 const next=await setup();await incoming(next.phone,'pode cancelar');await processInboxBatch(p,deps('cancel_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:next.second.id}})).state,'cancelled');assert.equal((await p.reminder.findUnique({where:{id:next.first.id}})).state,'active');
});
test('seleção pendente e envio incerto não habilitam confirmação curta',async()=>{
 const {phone,second,selection}=await setup(false);assert.equal(await shownTaskFocus(p,phone,biz,new Date()),null);
 await p.replyOutbox.update({where:{messageId:selection.id},data:{status:'delivery_unknown'}});assert.equal(await shownTaskFocus(p,phone,biz,new Date()),null);
 await incoming(phone,'pode concluir');await processInboxBatch(p,deps('complete_reminder'),biz);assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');
});
test('referência expira, não atravessa conta e outra resposta enviada encerra escolha',async()=>{
 const {phone}=await setup();assert.equal(await shownTaskFocus(p,phone,other,new Date()),null);assert.equal(await shownTaskFocus(p,phone,biz,new Date(Date.now()+6*60000)),null);
 await incoming(phone,'Obrigado');await processInboxBatch(p,deps('conversation'),biz);await send();assert.equal(await shownTaskFocus(p,phone,biz,new Date()),null);
});
test('tarefa alterada depois da escolha não é concluída pela referência antiga',async()=>{
 const {phone,second}=await setup();await p.reminder.update({where:{id:second.id},data:{scheduleVersion:{increment:1},title:'Nome corrigido'}});
 const source=await incoming(phone,'pode concluir');await processInboxBatch(p,deps('complete_reminder'),biz);assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');assert.match((await p.replyOutbox.findUnique({where:{messageId:source.id}})).text,/mudou/);
});
test('duas confirmações não reutilizam a mesma escolha',async()=>{
 const {phone,first,second}=await setup();await incoming(phone,'pode concluir');await incoming(phone,'pode cancelar');await Promise.all([processInboxBatch(p,deps('complete_reminder'),biz),processInboxBatch(p,deps('complete_reminder'),biz)]);await processInboxBatch(p,deps('cancel_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'completed');assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');assert.equal(await shownTaskFocus(p,phone,biz,new Date()),null);
});
test('rollback restaura escolha consumida e desfaz a conclusão',async()=>{
 const {phone,second}=await setup(),focus=await shownTaskFocus(p,phone,biz,new Date());
 await assert.rejects(p.$transaction(async tx=>{await manageReminders(phone,biz,intent('complete_reminder',{reminderId:second.id,selectionListId:focus.list.id,selectionIndex:focus.index,selectionFocusId:focus.id,expectedVersion:focus.list.items[focus.index].version}),tx);throw Error('rollback');}),/rollback/);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');assert.equal((await shownTaskFocus(p,phone,biz,new Date())).id,focus.id);
});
