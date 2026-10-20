require('./register.cjs');
const {test,before,after}=require('node:test'), assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const phone='5593'+String(Date.now()).slice(-11), business='recurrence-'+randomUUID();
before(()=>p.$connect());
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.$disconnect()});
const intent=(fields={})=>({action:'cancel_reminder',title:null,description:null,datetime:null,amount:null,category:null,reply:'ok',...fields});
async function make(count=3){
 const source=await p.incomingMessage.create({data:{providerMessageId:randomUUID(),phoneNumberId:business,phone,text:'revisar orçamentos'}});
 const input={phone,title:'revisar orçamentos',remindAt:'2099-01-31T09:00:00-03:00',recurrence:{frequency:'monthly',count}};
 const origin={phoneNumberId:business,sourceMessageId:source.id};
 return {first:await persistReminder(input,p,origin),input,origin};
}
test('série cria ocorrências e outboxes atomicamente sem duplicar na reentrega',async()=>{
 const {first,input,origin}=await make();await persistReminder(input,p,origin);
 const rows=await p.reminder.findMany({where:{seriesId:first.seriesId},orderBy:{occurrenceIndex:'asc'},include:{scheduleOutbox:true}});
 assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.sourceMessageId).length,1);
 assert.deepEqual(rows.map(r=>r.remindAt.toISOString().slice(0,10)),['2099-01-31','2099-03-31','2099-05-31']);
 assert.ok(rows.every(r=>r.scheduleOutbox.phoneNumberId===business));
});
test('concluir uma ocorrência mantém as demais e outra pessoa não cancela série',async()=>{
 const {first}=await make();
 await p.$transaction(tx=>manageReminders(phone,business,intent({action:'complete_reminder',reminderId:first.id}),tx));
 assert.equal(await p.reminder.count({where:{seriesId:first.seriesId,state:'active'}}),2);
 const row=await p.reminder.findFirst({where:{seriesId:first.seriesId,state:'active'}});
 assert.match(await p.$transaction(tx=>manageReminders('5511000000000',business,intent({reminderId:row.id,cancelSeries:true}),tx)),/Não encontrei/);
 await p.$transaction(tx=>manageReminders(phone,business,intent({reminderId:row.id,cancelSeries:true}),tx));
 assert.equal(await p.reminder.count({where:{seriesId:first.seriesId,state:'active'}}),0);
 assert.equal(await p.scheduleOutbox.count({where:{reminder:{seriesId:first.seriesId},status:'pending'}}),0);
});
test('mesmo título de séries diferentes pede escolha em vez de cancelar ambas',async()=>{
 await make();
 assert.match(await p.$transaction(tx=>manageReminders(phone,business,intent({search:'revisar orçamentos',cancelSeries:true}),tx)),/Qual deles/);
});
