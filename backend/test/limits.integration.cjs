require('./register.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {ReminderQuotaError}=require('../src/domain/reminder.limits.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const phone='5589'+String(Date.now()).slice(-11),business='limits-'+randomUUID();
before(()=>p.$connect());
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.$disconnect()});
const input={phone,title:'retornar contato',remindAt:'2099-01-01T10:00:00-03:00'};
test('oito criações concorrentes respeitam limite de dois avisos sem ultrapassar cota',async()=>{
 const results=await Promise.allSettled(Array.from({length:8},()=>persistReminder(input,p,{phoneNumberId:business,limits:{active:2,perDay:100}})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason instanceof ReminderQuotaError));
 assert.equal(await p.reminder.count({where:{user:{phone}}}),2);
});
test('série acima da cota é recusada inteira, sem criar primeira ocorrência ou outbox',async()=>{
 const before=await p.reminder.count({where:{user:{phone}}});
 await assert.rejects(persistReminder({...input,recurrence:{frequency:'daily',count:3}},p,{phoneNumberId:business,limits:{active:4,perDay:100}}),ReminderQuotaError);
 assert.equal(await p.reminder.count({where:{user:{phone}}}),before);
});
test('limites são isolados por conta e reentrega não consome cota novamente',async()=>{
 const other=business+'-other';
 const source=await p.incomingMessage.create({data:{phone,phoneNumberId:other,providerMessageId:randomUUID(),text:'retornar contato'}});
 const origin={phoneNumberId:other,sourceMessageId:source.id,limits:{active:1,perDay:1}};
 const one=await persistReminder(input,p,origin),again=await persistReminder(input,p,origin);
 assert.equal(one.id,again.id);
 await p.reminder.deleteMany({where:{sourceMessageId:source.id}});await p.incomingMessage.delete({where:{id:source.id}});
});
test('cota de pedidos evita IA e transcrição, mas PARAR continua funcionando',async()=>{
 const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
 const previous=process.env.MAX_REQUESTS_PER_USER_PER_DAY;process.env.MAX_REQUESTS_PER_USER_PER_DAY='1';
 const target=business+'-budget';
 try{
  const first=await p.incomingMessage.create({data:{phone,phoneNumberId:target,providerMessageId:randomUUID(),text:'primeiro pedido',receivedAt:new Date(Date.now()-5000),status:'completed'}});
  const blocked=await p.incomingMessage.create({data:{phone,phoneNumberId:target,providerMessageId:randomUUID(),text:'[Mensagem de voz]',mediaId:'123456',mediaMimeType:'audio/ogg'}});
  const deps={buildContext:()=>assert.fail('quota must precede AI'),interpret:()=>assert.fail(),transcribe:()=>assert.fail('quota must precede transcription')};
  await processInboxBatch(p,deps,target);
  const reply=await p.replyOutbox.findUniqueOrThrow({where:{messageId:blocked.id}});assert.match(reply.text,/limite de pedidos/);
  const pause=await p.incomingMessage.create({data:{phone,phoneNumberId:target,providerMessageId:randomUUID(),text:'PARAR'}});
  await processInboxBatch(p,deps,target);
  assert.equal((await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:target,phone}}})).remindersPaused,true);
 }finally{
  if(previous===undefined)delete process.env.MAX_REQUESTS_PER_USER_PER_DAY;else process.env.MAX_REQUESTS_PER_USER_PER_DAY=previous;
  await p.incomingMessage.deleteMany({where:{phoneNumberId:target}});await p.contactPreference.deleteMany({where:{phoneNumberId:target}});
 }
});
