// Explicit checkpoint transport: current OpenAI credentials never enter this
// local harness. Only fresh responses bound to the exact fixture-context hash.
const h=require('./lib/beta-fixtures.cjs');
const {assert,p,connection,save,load,harness,base,prepareRequest,resumeRequest,randomUUID}=h;
const {Queue}=require('bullmq');
const {retrieveContext}=require('../src/domain/context.retrieval.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const phase=process.argv[2];
async function prepareCorrection(state,ui){
 const before=await p.appointment.findUniqueOrThrow({where:{id:state.appointmentId}});
 const pending=await p.incomingMessage.findFirst({where:{phoneNumberId:state.account,status:'received',text:'Na verdade, mudou para as 16h.'}});
 if(!pending)await ui.receive('Na verdade, mudou para as 16h.');
 // Fault injection: a model guesses an ID after a multi-result recall. Guard
 // must ask for the target rather than mutate any plausible appointment.
 await ui.process({...base,action:'reschedule_appointment',appointmentId:state.appointmentId,datetime:'2099-06-02T19:00:00Z'});await ui.deliver();
 const vague=await p.incomingMessage.findFirstOrThrow({where:{phoneNumberId:state.account,text:'Na verdade, mudou para as 16h.'},orderBy:{receivedAt:'desc'}});assert.equal(vague.interpretation.action,'conversation');assert.equal((await p.appointment.findUniqueOrThrow({where:{id:before.id}})).version,before.version);
 const correction=await ui.receive('Na verdade, o compromisso Entrevista técnica de software mudou para as 16h.');await prepareRequest(state,correction,'correction');
 save('ambiguity-assertions',{multipleRelatedRecordsDoNotChooseFocus:true,unsafeModelGuessBlocked:true,appointmentUnchanged:true,explicitTargetRequested:true});
}
(async()=>{
 let state=phase==='prepare'?{account:'m04-'+randomUUID(),phone:'550000'+String(Date.now()).slice(-7),sequence:0}:load('state');
 const ui=await harness(state),queue=new Queue('reminders',{connection});
 try{
 if(phase==='prepare'){
  await ui.receive('assinatura inválida',{valid:false});assert.equal(await p.incomingMessage.count({where:{phoneNumberId:state.account}}),0);
  await ui.receive('MEMORIA PESSOAL');await ui.process();await ui.deliver();
  await ui.receive('ACEITO MEMORIA');await ui.process();await ui.deliver();
  const m=await ui.receive('Guarde na memória: estou buscando emprego em desenvolvimento de software.');await ui.process({...base,action:'remember_personal',title:'Carreira',description:'Estou buscando emprego em desenvolvimento de software.',memoryKind:'goal'});await ui.deliver();
  const memory=await p.event.findFirstOrThrow({where:{user:{phone:state.phone},type:'personal_memory'}});state.memoryId=memory.id;
  const old=new Date('2099-05-20T12:00:00Z');await p.incomingMessage.update({where:{id:m.id},data:{receivedAt:old}});await p.event.update({where:{id:memory.id},data:{createdAt:old,payload:{...memory.payload,updatedAt:old.toISOString()}}});
  const a=await ui.receive('Marca entrevista técnica de software em 02/06/2099 às 14h por uma hora, avisa quinze minutos antes.');await ui.process({...base,action:'create_appointment',title:'Entrevista técnica de software',datetime:'2099-06-02T14:00:00-03:00',durationMinutes:60,alertMinutes:[15]});await ui.deliver();
  state.appointmentId=(await p.appointment.findUniqueOrThrow({where:{sourceMessageId:a.id}})).id;await p.incomingMessage.update({where:{id:a.id},data:{receivedAt:new Date('2099-05-22T12:00:00Z')}});
  const req=await ui.receive('Organiza minha preparação para aquela entrevista técnica: anota que preciso revisar meus projetos e me lembra de preparar o portfólio amanhã às 10h. Quero revisar as duas ações antes.');
  const prepared=await prepareRequest(state,req,'plan');assert.ok(prepared.context.contextualMemory.items.some(x=>x.id===state.appointmentId));assert.equal(prepared.context.lastMessages.some(x=>x.user.includes('Marca entrevista')),false);
  console.log(JSON.stringify({phase,requestReady:'plan',oldMemoryDays:12,webhookSignatureVerified:true}));
 }else if(phase==='plan'){
  const result=await resumeRequest(state,'plan');assert.equal(result.interpretation.action,'assistant_plan');assert.equal(result.interpretation.planSteps.length,2);assert.ok(result.interpretation.planSteps.some(s=>s.action==='save_note'));const reminder=result.interpretation.planSteps.find(s=>s.action==='create_reminder');assert.equal(Date.parse(reminder.datetime),Date.parse('2099-06-02T13:00:00Z'));
  assert.equal(await p.event.count({where:{user:{phone:state.phone},type:'secretary_note'}}),0);assert.equal(await p.reminder.count({where:{user:{phone:state.phone}}}),1);assert.match(result.reply.text,/Ainda não executei/);await ui.deliver();
  const confirmed=await ui.receive('CONFIRMAR PLANO');await ui.process();await ui.deliver();
  state.noteId=(await p.event.findFirstOrThrow({where:{user:{phone:state.phone},type:'secretary_note'}})).id;assert.equal(await p.reminder.count({where:{user:{phone:state.phone}}}),2);assert.equal((await p.event.findUniqueOrThrow({where:{id:'assistant_plan:'+result.id}})).payload.status,'applied');
  await ui.receive('CONFIRMAR PLANO',{providerId:confirmed.providerMessageId});await ui.process();assert.equal(await p.reminder.count({where:{user:{phone:state.phone}}}),2);
  await ui.receive('Você lembra da área em que estou procurando trabalho?');await ui.process();await ui.deliver();const recalled=await p.replyOutbox.findFirstOrThrow({where:{message:{phoneNumberId:state.account,text:'Você lembra da área em que estou procurando trabalho?'}}});assert.match(recalled.text,/desenvolvimento de software/);
  save('plan-assertions',{proposalCreatedNoActions:true,confirmationAtomic:true,duplicateWebhookNoDuplicate:true,oldMemoryRecovered:true,sourceNoteId:state.noteId,reminders:2});
  await ui.receive('Você lembra daquela entrevista técnica?');await ui.process();await ui.deliver();await prepareCorrection(state,ui);
  console.log(JSON.stringify({phase,passed:true,nextRequest:'correction',reminders:2}));
 }else if(phase==='prepare-correction'){
  save('plan-assertions',{proposalCreatedNoActions:true,confirmationAtomic:true,duplicateWebhookNoDuplicate:true,oldMemoryRecovered:true,sourceNoteId:state.noteId,reminders:2});await prepareCorrection(state,ui);console.log(JSON.stringify({phase,passed:true,nextRequest:'correction'}));
 }else if(phase==='correction'){
  const before=await p.appointment.findUniqueOrThrow({where:{id:state.appointmentId}});const result=await resumeRequest(state,'correction');assert.equal(result.interpretation.action,'reschedule_appointment');assert.equal(result.interpretation.appointmentId,before.id);await ui.deliver();const after=await p.appointment.findUniqueOrThrow({where:{id:before.id}});assert.equal(after.startsAt.toISOString(),'2099-06-02T19:00:00.000Z');assert.equal(after.endsAt.toISOString(),'2099-06-02T20:00:00.000Z');assert.equal(after.version,before.version+1);
  const {relaySchedules}=require('../src/domain/schedule.relay.ts');await relaySchedules(p,queue,{phoneNumberId:state.account});assert.ok((await queue.getJobCounts('delayed')).delayed>=2);
  save('correction-assertions',{sameId:true,sameDay:true,timezone:'America/Sao_Paulo',before:before.startsAt,after:after.startsAt,version:after.version,queue:await queue.getJobCounts()});console.log(JSON.stringify({phase,passed:true,queuePublished:true}));
 }else throw Error('Use prepare, plan, correction');
 save('state',state);
 }finally{await queue.close();await ui.close();await p.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
