// Fictional conversation, isolated local test DB, simulated WhatsApp only.
if(!process.argv.includes('--allow-provider')){console.log('Use --allow-provider com INBOX_TEST_DATABASE_URL local terminando em _test. Usa tokens do provedor de texto.');process.exit(0)}
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const url=new URL(process.env.INBOX_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw Error('Only local isolated test DB');
const {createPrismaClient}=require('../dist/config/database');
const {processInboxBatch}=require('../dist/domain/inbox.processor');
const {conversationContext}=require('../dist/domain/conversation.context');
const {interpretMessage}=require('../dist/services/ai.service');
const {relayReplies}=require('../dist/domain/reply.relay');
const p=createPrismaClient(url.href),business='eval-conversation-'+randomUUID(),phone='5585'+String(Date.now()).slice(-9);
async function turn(text){
 const row=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:interpretMessage},business);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}});
 assert.ok(saved.reply,'Turn failed to produce reply');
 await relayReplies(p,async()=>({messages:[{id:'wamid.fictional-'+randomUUID()}]}),business);
 console.log(JSON.stringify({text,action:saved.interpretation.action,reply:saved.reply.text}));return saved;
}
async function main(){try{
 let r=await turn('Amanhã preciso falar com o João sobre o orçamento. Me lembra disso.');
 assert.equal(r.interpretation.action,'create_reminder');assert.equal(r.interpretation.datetime,null);assert.ok(r.interpretation.draft?.date);
 r=await turn('Às nove.');assert.equal(r.interpretation.action,'create_reminder');
 let reminders=await p.reminder.findMany({where:{user:{phone}}});assert.equal(reminders.length,1);const id=reminders[0].id;
 assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(reminders[0].remindAt),'09:00');
 r=await turn('Melhor nove e meia.');assert.equal(r.interpretation.action,'reschedule_reminder');
 let target=await p.reminder.findUniqueOrThrow({where:{id}});
 assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(target.remindAt),'09:30');
 const before=target.remindAt.getTime();r=await turn('Me avisa dez minutos antes.');assert.equal(r.interpretation.action,'reschedule_reminder');
 target=await p.reminder.findUniqueOrThrow({where:{id}});assert.equal(target.remindAt.getTime(),before-600000);
 r=await turn('Anota que o orçamento do João é R$ 500 e a entrega ficou para sexta-feira.');assert.equal(r.interpretation.action,'save_note');
 r=await turn('Qual o valor que combinei com o João?');assert.match(r.reply.text,/500/);
 r=await turn('Cancela esse lembrete do João.');assert.equal(r.interpretation.action,'cancel_reminder');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id}})).state,'cancelled');
 assert.equal(await p.reminder.count({where:{user:{phone}}}),1);
 console.log(JSON.stringify({result:'passed',turns:7,realWhatsAppSends:0}));
}finally{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.$disconnect()}}
main().catch(error=>{console.error(error.message);process.exitCode=1});
