require('./register.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {AudioRejectedError}=require('../src/domain/audio.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const business='audio-'+randomUUID(),phone='5592'+String(Date.now()).slice(-11);
before(()=>p.$connect());
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.$disconnect()});
const intent={action:'create_reminder',title:'ligar para fornecedor',datetime:'2099-01-01T10:00:00-03:00',description:null,amount:null,category:null,reply:'ok'};
async function make(){return p.incomingMessage.create({data:{phone,phoneNumberId:business,providerMessageId:randomUUID(),mediaId:'123456',mediaMimeType:'audio/ogg',text:'[Mensagem de voz]'}})}
test('áudio transcreve uma vez, preserva receivedAt e reprocessamento não duplica ação',async()=>{
 const row=await make();let calls=0;
 const deps={transcribe:async()=>{calls++;return 'Me lembra daqui a 1 minuto de ligar para fornecedor'},
 buildContext:async m=>{assert.equal(m.text,'Me lembra daqui a 1 minuto de ligar para fornecedor');assert.equal(m.receivedAt.getTime(),row.receivedAt.getTime());return {}},interpret:async()=>intent};
 await processInboxBatch(p,deps,business);await processInboxBatch(p,deps,business);
 assert.equal(calls,1);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reminder:true,reply:true}});
 assert.ok(saved.transcribedAt);assert.equal(saved.reminder.remindAt.getTime(),row.receivedAt.getTime()+60000);assert.equal(saved.status,'reply_pending');
});
test('falha de interpretação reutiliza transcrição persistida',async()=>{
 const row=await make();let calls=0;
 const deps={transcribe:async()=>{calls++;return 'Me lembra amanhã às dez de ligar para fornecedor'},buildContext:async()=>({}),interpret:async()=>{throw Error('temporary')}};
 await processInboxBatch(p,deps,business);
 await p.incomingMessage.update({where:{id:row.id},data:{nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{...deps,interpret:async()=>intent},business);
 assert.equal(calls,1);assert.equal(await p.reminder.count({where:{sourceMessageId:row.id}}),1);
});
test('áudio inválido responde sem criar lembrete nem consultar IA',async()=>{
 const row=await make();await processInboxBatch(p,{transcribe:async()=>{throw new AudioRejectedError('bad audio')},buildContext:()=>assert.fail(),interpret:()=>assert.fail()},business);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reminder:true,reply:true}});
 assert.equal(saved.reminder,null);assert.match(saved.reply.text,/Não consegui entender/);
});
