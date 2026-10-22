require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {detectedAgendaPeriod,guardSubjectPeriod}=require('../src/domain/agenda.period.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('agenda dela em continuação consulta o cliente em foco e pergunta se não há referência',async()=>{
 const message={text:'E a agenda dela amanhã?',receivedAt:new Date()};
 const interpret=async()=>({action:'conversation',reply:'Não tem nada amanhã.'});
 const r=await prepareConversation(message,{interpret,buildContext:async()=>({conversationState:{focusedSubject:{name:'Ana Souza',kind:'client'}}})});
 assert.equal(r.action,'subject_overview');assert.equal(r.subject,'Ana Souza');assert.equal(r.agendaPeriod,'tomorrow');
 const missing=await prepareConversation(message,{interpret,buildContext:async()=>({})});
 assert.equal(missing.action,'conversation');assert.match(missing.reply,/De qual cliente ou projeto/);
 const comment=await prepareConversation({...message,text:'Não quero consultar a agenda dela agora.'},{interpret,buildContext:async()=>({conversationState:{focusedSubject:{name:'Ana Souza',kind:'client'}}})});
 assert.equal(comment.action,'conversation');
});
test('pedido explícito de agenda não vira lista só de tarefas por filtro herdado',async()=>{
 const deps={buildContext:async()=>({subjects:[{name:'Ana Souza',kind:'client'}]}),interpret:async()=>({action:'list_reminders',subject:'Bruno',taskFilter:'pending',agendaPeriod:'tomorrow',reply:'interno'})};
 const r=await prepareConversation({text:'Como está a agenda da Ana Souza depois de amanhã?',receivedAt:new Date()},deps);
 assert.equal(r.action,'agenda_overview');assert.equal(r.subject,'Ana Souza');assert.equal(r.taskFilter,undefined);assert.equal(r.agendaPeriod,'day_after_tomorrow');
 const ambiguous=await prepareConversation({text:'Como está a agenda da Ana Souza depois de amanhã?',receivedAt:new Date()},
  {...deps,buildContext:async()=>({subjects:[{name:'Ana Souza',kind:'client'},{name:'Ana Souza',kind:'project'}]})});
 assert.equal(ambiguous.action,'conversation');assert.match(ambiguous.reply,/qual cliente ou projeto/);
 for(const text of ['Lista as tarefas pendentes da agenda amanhã','Quais lembretes da agenda foram concluídos?']){
  const result=await prepareConversation({text,receivedAt:new Date()},deps);assert.equal(result.action,'list_reminders',text);
 }
});
test('consulta de cliente depois de amanhã corrige período amanhã sugerido pelo modelo',async()=>{
 const r=await prepareConversation({text:'O que tenho com Ana depois de amanhã?',receivedAt:new Date()},
  {buildContext:async()=>({subjects:[{name:'Ana',kind:'client'}]}),interpret:async()=>({action:'subject_overview',subject:'Ana',agendaPeriod:'tomorrow',reply:'interno'})});
 assert.equal(r.action,'subject_overview');assert.equal(r.subject,'Ana');assert.equal(r.agendaPeriod,'day_after_tomorrow');
});
test('períodos explícitos são reconhecidos sem confundir depois de amanhã ou semanas diferentes',()=>{
 for(const [text,period] of [['com Ana nesta semana','week'],['com Ana semana que vem','next_week'],['com ela nos próximos 7 dias','next_7_days'],['com Ana hoje','today'],['com Ana amanhã','tomorrow']])assert.equal(detectedAgendaPeriod(text),period);
 assert.equal(detectedAgendaPeriod('hoje e amanhã'),'ambiguous');assert.equal(detectedAgendaPeriod('depois de amanhã'),'day_after_tomorrow');assert.equal(detectedAgendaPeriod('amanhã e depois de amanhã'),'ambiguous');
});
test('pergunta de cliente vira consulta real com período mesmo se modelo responder conversa',async()=>{
 const r=await prepareConversation({text:'O que tenho com Ana nesta semana?',receivedAt:new Date()},{buildContext:async()=>({subjects:[{name:'Ana',kind:'client'}]}),interpret:async()=>({action:'conversation',reply:'Agenda inventada'})});assert.equal(r.action,'subject_overview');assert.equal(r.subject,'Ana');assert.equal(r.agendaPeriod,'week');
});
test('pronome recente com período corrige cliente sugerido indevidamente pelo modelo',async()=>{
 const r=await prepareConversation({text:'O que tenho com ela na próxima semana?',receivedAt:new Date()},{buildContext:async()=>({subjects:[{name:'Ana',kind:'client'},{name:'Bruno',kind:'client'}],conversationState:{focusedSubject:{name:'Ana',kind:'client'}}}),interpret:async()=>({action:'agenda_overview',subject:'Bruno',agendaPeriod:'week',reply:'interno'})});assert.equal(r.subject,'Ana');assert.equal(r.agendaPeriod,'next_week');
});
test('período ambíguo ou não interpretado não devolve cadastro sem filtro',()=>{
 for(const text of ['O que tenho com Ana hoje e amanhã?','O que tenho com Ana na semana passada?','O que tenho com Ana amanhã e depois de amanhã?','O que tenho com Ana no dia 15?','O que tenho com Ana no dia quinze?','O que tenho com Ana nesta semana às nove?']){const i={action:'subject_overview',subject:'Ana',reply:'interno'};guardSubjectPeriod(i,text);assert.equal(i.action,'conversation',text);}
 const complete={action:'subject_overview',subject:'Ana',rangeStart:'2099-06-03T03:00:00Z',rangeEnd:'2099-06-04T03:00:00Z',reply:'interno'};guardSubjectPeriod(complete,'O que tenho com Ana depois de amanhã?');assert.equal(complete.action,'subject_overview');
});
test('cliente e projeto de mesmo nome exigem tipo claro na conversa',async()=>{
 const subjects=[{name:'Ana',kind:'client'},{name:'Ana',kind:'project'}],message={text:'O que tenho com o projeto Ana nesta semana?',receivedAt:new Date()};
 const deps={buildContext:async()=>({subjects}),interpret:async()=>({action:'conversation',reply:'interno'})};
 const r=await prepareConversation(message,deps);assert.equal(r.action,'subject_overview');assert.equal(r.subjectKind,'project');
 const ambiguous=await prepareConversation({...message,text:'O que tenho com Ana nesta semana?'},deps);assert.equal(ambiguous.action,'conversation');
});
