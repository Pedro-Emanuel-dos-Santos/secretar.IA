require('./register.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {executeLocalCommand}=require('../src/domain/local.commands.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {prepareReminderExecution}=require('../src/domain/reminder.execution.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const phone='5591'+String(Date.now()).slice(-11),business='prefs-'+randomUUID(),other=business+'-other';
before(()=>p.$connect());
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[business,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[business,other]}}});await p.$disconnect()});
async function make(){return persistReminder({phone,title:'prazo de orçamento',remindAt:'2099-01-01T09:00:00-03:00'},p,{phoneNumberId:business})}
test('pausa é por pessoa e número comercial e bloqueia nova criação no inbox',async()=>{
 await p.$transaction(tx=>executeLocalCommand('pause',phone,business,tx));
 assert.equal((await p.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:business,phone}}})).remindersPaused,true);
 assert.equal(await p.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:other,phone}}}),null);
 await assert.rejects(make(),/pausados/);
 const row=await p.incomingMessage.create({data:{phone,phoneNumberId:business,providerMessageId:randomUUID(),text:'me lembra amanhã às dez de orçamento'}});
 await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>({action:'create_reminder',title:'orçamento',datetime:'2099-01-01T10:00:00-03:00',description:null,category:null,amount:null,reply:'ok'})},business);
 const result=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reminder:true,reply:true}});
 assert.equal(result.reminder,null);assert.match(result.reply.text,/pausados/);
});
test('retomar não dispara avisos vencidos durante pausa e preserva avisos futuros',async()=>{
 await p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:business,phone}},data:{remindersPaused:false,pausedAt:null}});
 const due=await make(),future=await make();const now=Date.now();
 await p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:business,phone}},data:{pausedAt:new Date(now-60000),remindersPaused:true}});
 await p.reminder.update({where:{id:due.id},data:{remindAt:new Date(now-30000),status:'scheduled'}});
 await p.$transaction(tx=>executeLocalCommand('resume',phone,business,tx));
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:due.id}})).status,'blocked_paused');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:future.id}})).status,'scheduling_pending');
 assert.equal((await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:business,phone}}})).remindersPaused,false);
});
test('execução antecipada é devolvida ao horário certo; atraso longo é registrado sem envio',async()=>{
 const row=await make(),due=new Date('2099-01-01T12:00:00Z').getTime();
 assert.deepEqual(await prepareReminderExecution(p,row.id,business,0,due-1000),{kind:'defer',until:due});
 assert.deepEqual(await prepareReminderExecution(p,row.id,business,0,due),{kind:'ready'});
 assert.deepEqual(await prepareReminderExecution(p,row.id,other,0,due),{kind:'skipped'});
 assert.deepEqual(await prepareReminderExecution(p,row.id,business,1,due),{kind:'skipped'});
 assert.deepEqual(await prepareReminderExecution(p,row.id,business,0,due+3600001),{kind:'missed'});
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:row.id}})).status,'missed');
 assert.equal((await p.scheduleOutbox.findUniqueOrThrow({where:{reminderId:row.id}})).status,'expired');
});
test('meu dia limita detalhes e nunca inclui tarefas de outra conta',async()=>{
 const {dayOverview}=require('../src/domain/day.overview.ts');
 const now=new Date('2099-01-01T15:00:00Z');
 await persistReminder({phone,title:'SEGREDO DE OUTRA CONTA',remindAt:'2099-01-01T15:00:00-03:00'},p,{phoneNumberId:other});
 const summary=await p.$transaction(tx=>dayOverview(phone,business,tx,now));
 assert.match(summary,/horário de Brasília/);assert.doesNotMatch(summary,/SEGREDO/);
});
