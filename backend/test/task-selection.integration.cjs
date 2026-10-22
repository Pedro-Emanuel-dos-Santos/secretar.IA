require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {relayReplies}=require('../src/domain/reply.relay.ts');
const {shownTaskList}=require('../src/domain/task.selection.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='selection-'+randomUUID(),other=biz+'other',phones=[];
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const deps=action=>({buildContext:m=>conversationContext(p,m),interpret:async()=>intent(action,{reminderId:'wrong-id',search:'wrong title'})});
async function incoming(phone,text){return p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0)}});}
async function setup(send=true){
 const phone='55'+String(Date.now()).slice(-10)+String(phones.length);phones.push(phone);
 const first=await persistReminder({phone,title:'Tarefa igual',remindAt:'2099-06-01T12:00:00Z'},p,{phoneNumberId:biz});
 const second=await persistReminder({phone,title:'Tarefa igual',remindAt:'2099-06-02T12:00:00Z'},p,{phoneNumberId:biz});
 const message=await incoming(phone,'Lista minhas tarefas');await processInboxBatch(p,{...deps('list_reminders'),interpret:async()=>intent('list_reminders')},biz);
 if(send)await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);
 return {phone,first,second,message};
}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});
test('conclui segundo item da lista enviada com títulos iguais e sobrevive à nova leitura',async()=>{
 const {phone,first,second}=await setup();const list=await shownTaskList(p,phone,biz,new Date());assert.equal(list.items[1].id,second.id);
 const message=await incoming(phone,'Conclui o segundo');await processInboxBatch(p,deps('complete_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'completed');
 const row=await p.incomingMessage.findUnique({where:{id:message.id}});assert.equal(row.interpretation.reminderId,second.id);assert.equal(row.interpretation.selectionListId,list.id);
 await processInboxBatch(p,deps('complete_reminder'),biz);assert.equal(await p.replyOutbox.count({where:{messageId:message.id}}),1);
});
test('lista pendente ou com envio incerto não autoriza escolha por posição',async()=>{
 const {phone,second,message}=await setup(false);assert.equal(await shownTaskList(p,phone,biz,new Date()),null);
 await p.replyOutbox.update({where:{messageId:message.id},data:{status:'delivery_unknown'}});assert.equal(await shownTaskList(p,phone,biz,new Date()),null);
 await incoming(phone,'Cancela o segundo');await processInboxBatch(p,deps('cancel_reminder'),biz);assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');
});
test('troca de ordem do banco não troca identidade da posição apresentada',async()=>{
 const {phone,first,second}=await setup();await persistReminder({phone,title:'Nova anterior',remindAt:'2099-05-01T12:00:00Z'},p,{phoneNumberId:biz});
 await incoming(phone,'Cancela o segundo');await processInboxBatch(p,deps('cancel_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'cancelled');assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');
});
test('item alterado depois da lista é recusado antes de concluir',async()=>{
 const {phone,second}=await setup();await p.reminder.update({where:{id:second.id},data:{title:'Título atualizado',scheduleVersion:{increment:1}}});
 const row=await incoming(phone,'Conclui o segundo');await processInboxBatch(p,deps('complete_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');assert.match((await p.replyOutbox.findUnique({where:{messageId:row.id}})).text,/mudou/);
});
test('lista expira, é isolada por conta e outra resposta encerra referência',async()=>{
 const {phone}=await setup();assert.equal(await shownTaskList(p,phone,other,new Date()),null);assert.equal(await shownTaskList(p,phone,biz,new Date(Date.now()+16*60000)),null);
 await incoming(phone,'Olá');await processInboxBatch(p,deps('conversation'),biz);await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);assert.equal(await shownTaskList(p,phone,biz,new Date()),null);
});
test('versão muda entre interpretação e execução sem permitir alteração tardia',async()=>{
 const {phone,second}=await setup(),list=await shownTaskList(p,phone,biz,new Date());
 const selected=intent('complete_reminder',{reminderId:second.id,expectedVersion:second.scheduleVersion,selectionListId:list.id,selectionIndex:1});
 await p.reminder.update({where:{id:second.id},data:{taskProgress:'waiting',scheduleVersion:{increment:1}}});
 const reply=await p.$transaction(tx=>manageReminders(phone,biz,selected,tx));assert.match(reply,/mudou/);assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');
});

test('último usa snapshot enviado mesmo após nova tarefa',async()=>{
 const {phone,first,second}=await setup();await persistReminder({phone,title:'Nova após a lista',remindAt:'2099-06-03T12:00:00Z'},p,{phoneNumberId:biz});
 await incoming(phone,'Cancela o último');await processInboxBatch(p,deps('cancel_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'cancelled');assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');
});
test('penúltimo seleciona e confirmação posterior conclui só o item escolhido',async()=>{
 const {phone,first,second}=await setup();await incoming(phone,'O penúltimo');await processInboxBatch(p,deps('conversation'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'active');
 await relayReplies(p,async()=>({messages:[{id:randomUUID()}]}),biz);
 await incoming(phone,'Pode concluir');await processInboxBatch(p,deps('complete_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:first.id}})).state,'completed');assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');
});
test('último alterado após apresentação é recusado pela versão do snapshot',async()=>{
 const {phone,second}=await setup();await p.reminder.update({where:{id:second.id},data:{title:'Corrigida',scheduleVersion:{increment:1}}});
 const source=await incoming(phone,'Conclui o último');await processInboxBatch(p,deps('complete_reminder'),biz);
 assert.equal((await p.reminder.findUnique({where:{id:second.id}})).state,'active');assert.match((await p.replyOutbox.findUnique({where:{messageId:source.id}})).text,/mudou/);
});
