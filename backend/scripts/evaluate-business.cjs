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
const styleObservations=[];
async function turn(text,action){
 const row=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:interpretMessage},business);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}});
 assert.ok(saved.reply,'Turn failed to produce reply: '+JSON.stringify({text,status:saved.status,lastError:saved.lastError,interpretation:saved.interpretation}));
 await relayReplies(p,async()=>({messages:[{id:'wamid.fictional-'+randomUUID()}]}),business);
 turns++;console.log(JSON.stringify({turn:turns,text,action:saved.interpretation.action,reply:saved.reply.text}));
 if(saved.interpretation.action==='conversation' && /se (?:precisar|quiser)|fique [àa] vontade|[ée] s[oó] (?:avisar|pedir)/i.test(saved.reply.text))styleObservations.push({turn:turns,issue:'possible_unsolicited_offer',reply:saved.reply.text});
 if(/Não encontrei.*compromisso/.test(saved.reply.text))console.log(JSON.stringify({fictionalTargetDiagnostic:saved.interpretation,appointments:await p.appointment.findMany({where:{phoneNumberId:business},select:{id:true,title:true,state:true}})}));
 assert.ok([action].flat().includes(saved.interpretation.action),`Expected ${action}; got ${saved.interpretation.action}`);return saved;
}
async function naturalConversation(){
 const tasks=()=>p.reminder.findMany({where:{user:{phone},appointmentId:null,kind:'task'},orderBy:{createdAt:'asc'}});
 const clock=d=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(d);
 await turn('Me lembra amanhã de mandar o orçamento para Ana Souza.','create_reminder');
 assert.equal((await tasks()).length,0,'Incomplete request must not schedule midnight');
 await turn('Nove e meia da manhã.','create_reminder');
 let rows=await tasks();assert.equal(rows.length,1);assert.equal(clock(rows[0].remindAt),'09:30');
 const id=rows[0].id,initial=rows[0].remindAt.getTime();
 await turn('Melhor às dez da manhã.','reschedule_reminder');
 rows=await tasks();assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].remindAt.getTime(),initial+1800000,'Clock correction must preserve calendar day');
 const thanks=await turn('Valeu!','conversation');
 assert.ok(thanks.reply.text.length<=140,'Simple thanks should stay brief');
 assert.equal((await tasks()).length,1);
 await turn('Putz, esqueci de mandar. Só queria comentar mesmo.','conversation');
 rows=await tasks();assert.equal(rows.length,1);assert.equal(rows[0].state,'active');assert.equal(rows[0].taskProgress,'pending');
 await turn('Me lembra depois de amanhã de revisar o contrato.','create_reminder');
 assert.equal((await tasks()).length,1);
 await turn('Não, deixa pra lá.','discard_draft');
 rows=await tasks();assert.equal(rows.length,1);assert.equal(rows[0].state,'active','Discarding a draft must not cancel a saved task');
 await turn('Me lembra amanhã às onze da manhã de conferir o estoque.','create_reminder');
 rows=await tasks();assert.equal(rows.length,2);
 const list=await turn('Lista minhas tarefas pendentes.','list_reminders');
 assert.match(list.reply.text,/orçamento/i);assert.match(list.reply.text,/estoque/i);
 await turn('O segundo.',['select_task','conversation']);
 await turn('Pode concluir.','complete_reminder');
 rows=await tasks();assert.equal(rows.find(r=>r.id===id).taskProgress,'pending');
 assert.equal(rows.find(r=>r.id!==id).taskProgress,'completed','Only the selected item should be completed');
 const agenda=await turn('Valeu, e amanhã o que tenho?','agenda_overview');
 assert.match(agenda.reply.text,/orçamento/i);
 assert.doesNotMatch(agenda.reply.text,/conferir o estoque/i,'Completed task must not return as pending');
 await turn('Só queria comentar: me lembra amanhã às dez de cobrar a gráfica.','create_reminder');
 rows=await tasks();assert.equal(rows.length,3,'A conversational preface must not hide an explicit request');
 assert.equal(clock(rows.find(r=>/gráfica/i.test(r.title)).remindAt),'10:00');
 const state=items=>items.map(({id,state,taskProgress,remindAt})=>({id,state,taskProgress,remindAt}));
 const before=state(rows);
 for(const text of ['Show, obrigado pela força!','Hoje foi uma correria, só desabafando mesmo.']){
  const comment=await turn(text,'conversation');
  assert.ok(comment.reply.text.length<=180,'Social acknowledgement should stay brief');
  assert.deepEqual(state(await tasks()),before,'Social comment must not alter saved tasks');
 }
 assert.deepEqual(styleObservations,[],'Unsolicited offers in this conversation need review');
 console.log(JSON.stringify({result:'passed',suite:'natural',turns,realWhatsAppSends:0,styleObservations}));
}
async function event(){return p.appointment.findFirstOrThrow({where:{phoneNumberId:business},include:{reminders:{where:{state:'active'}}}});}
async function main(){
 // Fail before entering cleanup when the local database is unavailable.
 try{await p.$queryRaw`SELECT 1`;}catch{await p.$disconnect();throw Error('Local test database unavailable. Start Docker/PostgreSQL before evaluation.');}
 try{
 if(process.argv.includes('--natural')){await naturalConversation();return;}
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
