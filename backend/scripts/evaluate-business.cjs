// Fictional data, isolated local test database, simulated WhatsApp only.
if(!process.argv.includes('--allow-provider')){console.log('Requires --allow-provider and local INBOX_TEST_DATABASE_URL ending _test. Uses text-provider tokens.');process.exit(0);}
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const url=new URL(process.env.INBOX_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw Error('Only local isolated test DB');
const {createPrismaClient}=require('../dist/config/database');
const {processInboxBatch}=require('../dist/domain/inbox.processor');
const {conversationContext}=require('../dist/domain/conversation.context');
const {aiRouter}=require('../dist/ai/ai-router');
const {secretaryPrompt}=require('../dist/prompts/secretary.prompt');
const {parseInterpretation}=require('../dist/domain/interpretation.validation');
async function interpretMessage(context){
 const response=await aiRouter({task:'conversation',temperature:0.2,jsonMode:true,messages:[{role:'system',content:secretaryPrompt},{role:'user',content:JSON.stringify(context)}]});
 try{return parseInterpretation(response.content);}catch(error){console.log(JSON.stringify({fictionalInvalidInterpretation:response.content,error:error.message}));throw error;}
}
const {relayReplies}=require('../dist/domain/reply.relay');
const p=createPrismaClient(url.href),business='eval-business-'+randomUUID(),phone='5582'+String(Date.now()).slice(-9);
let turns=0;
async function turn(text,action){
 const row=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:interpretMessage},business);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}});
 assert.ok(saved.reply,'Turn failed to produce reply: '+JSON.stringify({text,status:saved.status,lastError:saved.lastError,interpretation:saved.interpretation}));
 await relayReplies(p,async()=>({messages:[{id:'wamid.fictional-'+randomUUID()}]}),business);
 turns++;console.log(JSON.stringify({turn:turns,text,action:saved.interpretation.action,reply:saved.reply.text}));
 assert.equal(saved.interpretation.action,action);return saved;
}
async function event(){return p.appointment.findFirstOrThrow({where:{phoneNumberId:business},include:{reminders:{where:{state:'active'}}}});}
async function main(){try{
 await turn('Guarda no cadastro do cliente João Silva: o orçamento é R$ 500.','save_fact');
 await turn('Atualiza o orçamento do cliente João Silva para R$ 650.','save_fact');
 let r=await turn('Qual é o orçamento atual do João Silva?','search_facts');assert.match(r.reply.text,/650/);assert.doesNotMatch(r.reply.text,/500/);
 r=await turn('E qual era o orçamento anterior do João Silva? Quero o histórico.','search_facts');assert.match(r.reply.text,/500/);assert.match(r.reply.text,/650/);
 await turn('Marca uma reunião com o João Silva amanhã.','create_appointment');assert.equal(await p.appointment.count({where:{phoneNumberId:business}}),0);
 await turn('Nove e meia da manhã.','create_appointment');let a=await event();const initial=a.startsAt.getTime();
 assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(a.startsAt),'09:30');
 await turn('Me avisa meia hora antes dessa reunião.','set_appointment_alerts');a=await event();assert.equal(a.startsAt.getTime(),initial);assert.deepEqual(a.reminders.map(r=>r.appointmentOffsetMinutes),[30]);
 await turn('Também quero um aviso na hora da reunião.','set_appointment_alerts');a=await event();assert.equal(a.startsAt.getTime(),initial);assert.deepEqual(a.reminders.map(r=>r.appointmentOffsetMinutes).sort((a,b)=>a-b),[0,30]);
 await turn('Muda a reunião para as dez da manhã no mesmo dia.','reschedule_appointment');a=await event();assert.equal(a.startsAt.getTime(),initial+1800000);assert.deepEqual(a.reminders.map(r=>r.appointmentOffsetMinutes).sort((a,b)=>a-b),[0,30]);
 r=await turn('Quais são meus compromissos de amanhã?','list_appointments');assert.match(r.reply.text,/10:00/);assert.match(r.reply.text,/09:30/);
 await turn('Cancela essa reunião com o João Silva.','cancel_appointment');assert.equal(await p.appointment.count({where:{phoneNumberId:business,state:'active'}}),0);assert.equal(await p.reminder.count({where:{user:{phone},state:'active'}}),0);
 const auditBefore=await p.event.count({where:{user:{phone}}});
 r=await turn('O que mudou na reunião com o João Silva antes de eu cancelar? Quero o histórico.','appointment_history');
 assert.match(r.reply.text,/09:30/);assert.match(r.reply.text,/10:00/);assert.match(r.reply.text,/cancelado/);
 assert.equal(await p.event.count({where:{user:{phone}}}),auditBefore);
 assert.equal(await p.appointment.count({where:{phoneNumberId:business,state:'active'}}),0);
 assert.equal(await p.reminder.count({where:{user:{phone},state:'active'}}),0);
 await turn('Apaga o orçamento do cadastro do cliente João Silva, inclusive os valores antigos.','forget_fact');
 assert.equal(await p.knowledgeFact.count({where:{subject:{user:{phone}},key:'orcamento'}}),0);
 r=await turn('Qual é o orçamento atual do cliente João Silva?','search_facts');assert.doesNotMatch(r.reply.text,/500|650/);
 await turn('Me lembra amanhã às onze da manhã de cobrar a aprovação do João.','create_reminder');
 let task=await p.reminder.findFirstOrThrow({where:{user:{phone},appointmentId:null,state:'active'}});
 await turn('Já cobrei essa aprovação, agora estou aguardando o João responder.','mark_waiting');
 task=await p.reminder.findUniqueOrThrow({where:{id:task.id},include:{scheduleOutbox:true}});assert.equal(task.taskProgress,'waiting');assert.equal(task.scheduleOutbox.status,'cancelled');
 r=await turn('Quais tarefas estão aguardando resposta?','list_reminders');assert.equal(r.interpretation.taskFilter,'waiting');assert.match(r.reply.text,/aguardando/);
 await turn('Corrige só o título dessa tarefa para Confirmar aprovação com Maria.','edit_reminder');
 task=await p.reminder.findUniqueOrThrow({where:{id:task.id}});assert.equal(task.title,'Confirmar aprovação com Maria');assert.equal(task.taskProgress,'waiting');
 await turn('Retoma essa tarefa e me lembra depois de amanhã às dez da manhã.','reschedule_reminder');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:task.id}})).taskProgress,'pending');
 await turn('Já resolvi a aprovação da Maria, pode concluir essa tarefa.','complete_reminder');
 assert.equal((await p.reminder.findUniqueOrThrow({where:{id:task.id}})).taskProgress,'completed');
 r=await turn('Quais tarefas eu concluí?','list_reminders');assert.equal(r.interpretation.taskFilter,'completed');assert.match(r.reply.text,/Confirmar aprovação com Maria/);
 console.log(JSON.stringify({result:'passed',turns,realWhatsAppSends:0}));
}finally{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.$disconnect();}}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
