require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {explicitClock}=require('../src/domain/conversation.timing.ts');
const {notesReply}=require('../src/domain/notes.ts');
const base={action:'create_reminder',title:'Falar com João',description:null,datetime:'2099-05-02T09:00:00-03:00',amount:null,category:null,reply:'interno'};
test('dia sem hora vira rascunho em vez de aceitar horário inventado pela IA',async()=>{
 const r=await prepareConversation({text:'Amanhã preciso falar com João, me lembra disso',receivedAt:new Date('2099-05-01T15:00:00Z')},{buildContext:async()=>({}),interpret:async()=>({...base})});
 assert.equal(r.datetime,null);assert.deepEqual(r.draft,{date:'2099-05-02',time:null});
});
test('hora informada antes permanece disponível quando pessoa completa só o dia',async()=>{
 const r=await prepareConversation({text:'amanhã',receivedAt:new Date('2099-05-01T15:00:00Z')},{buildContext:async()=>({conversationState:{pendingRequest:{draft:{date:null,time:'09:00'}}}}),interpret:async()=>({...base})});
 assert.equal(r.datetime,base.datetime);
 for(const text of ['às nove','umas nove','melhor nove e meia.','nove e meia da manhã','nove e meia da manha','duas e meia da tarde','oito da noite','melhor nove e meia da manhã.','9h30','meio-dia'])assert.equal(explicitClock(text),true,text);
 assert.equal(explicitClock('comprar nove caixas amanhã'),false);
 for(const text of ['nove horas e meia da manhã','duas e vinte e cinco da tarde','oito e quarenta e cinco da noite'])assert.equal(explicitClock(text),true,text);
});
test('rascunhos rejeitam hora inválida e não podem acompanhar anotação',()=>{
 assert.throws(()=>parseInterpretation(JSON.stringify({...base,draft:{date:null,time:'25:30'}})));
 assert.throws(()=>parseInterpretation(JSON.stringify({...base,action:'save_note',draft:{date:null,time:null}})));
});
test('consulta de notas grandes cabe numa mensagem e indica que há mais resultados',()=>{
 const reply=notesReply(Array.from({length:10},()=>({text:'x'.repeat(1500)})));
 assert.ok(reply.length<4096);assert.match(reply,/mais resultados/);
});
test('correção clara do horário não cria segundo lembrete mesmo se IA errar a ação',async()=>{
 const r=await prepareConversation({text:'Melhor nove e meia.',receivedAt:new Date('2099-05-01T15:00:00Z')},{
  buildContext:async()=>({conversationState:{focusedReminder:{id:'existing',state:'active'}}}),interpret:async()=>({...base})});
 assert.equal(r.action,'reschedule_reminder');assert.equal(r.reminderId,'existing');assert.equal(r.search,null);
});

test('contrato de compromissos rejeita avisos duplicados, negativos e excessivos',()=>{
 for(const alertMinutes of [[],[0,0],[-1],[1.5],[10081],[1,2,3,4],null])assert.throws(()=>parseInterpretation(JSON.stringify({...base,action:'create_appointment',alertMinutes})));
 assert.deepEqual(parseInterpretation(JSON.stringify({...base,action:'create_appointment',alertMinutes:[30,0]})).alertMinutes,[30,0]);
 assert.equal(parseInterpretation(JSON.stringify({...base,action:'set_appointment_alerts',subjectKind:null,alertMinutes:[30]})).subjectKind,undefined);
 for(const fields of [{subjectKind:'admin'},{includeHistory:'yes'},{subject:{}},{factValue:10}])assert.throws(()=>parseInterpretation(JSON.stringify({...base,action:'save_fact',...fields})));
});
test('compromisso sem hora não vira meia-noite e correção usa evento em foco',async()=>{
 const message={text:'Marca reunião amanhã',receivedAt:new Date('2099-05-01T15:00:00Z')};
 const r=await prepareConversation(message,{buildContext:async()=>({}),interpret:async()=>({...base,action:'create_appointment'})});
 assert.equal(r.datetime,null);assert.deepEqual(r.draft,{date:'2099-05-02',time:null});
 const corrected=await prepareConversation({...message,text:'Melhor nove e meia da manhã.'},{buildContext:async()=>({conversationState:{focusedAppointment:{id:'event',state:'active'}}}),interpret:async()=>({...base})});
 assert.equal(corrected.action,'reschedule_appointment');assert.equal(corrected.appointmentId,'event');
});
test('duração de um aviso não sobrescreve horário explícito do compromisso',async()=>{
 const r=await prepareConversation({text:'Reunião às dez, me avisa daqui a um minuto',receivedAt:new Date('2099-05-01T15:00:00Z')},{buildContext:async()=>({}),interpret:async()=>({...base,action:'create_appointment'})});
 assert.equal(r.datetime,base.datetime);
});
