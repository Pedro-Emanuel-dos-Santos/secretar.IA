require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {statedAppointmentDuration,guardAppointmentDuration}=require('../src/domain/appointment.duration.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('duração explícita reconhece horas, minutos e meia hora sem usar antecedência',()=>{
 for(const [text,n] of [['Reunião amanhã às dez por uma hora',60],['Consulta de meia hora',30],['Duração de 90 minutos',90],['A visita vai durar uma hora e meia',90],['Aula com duração de 1,5 horas',90]])assert.equal(statedAppointmentDuration(text),n,text);
 for(const text of ['Reunião às dez, me avisa uma hora antes','Avise por 30 minutos antes','Reunião amanhã às dez'])assert.equal(statedAppointmentDuration(text),null,text);
});
test('modelo não inventa duração e duração explícita vence palpite',()=>{
 const i={action:'create_appointment',durationMinutes:60};guardAppointmentDuration(i,'Reunião amanhã às dez');assert.equal(i.durationMinutes,undefined);
 guardAppointmentDuration(i,'Reunião amanhã às dez por meia hora');assert.equal(i.durationMinutes,30);
});
test('rascunho carrega duração declarada somente para a mesma operação e alvo',()=>{
 const context={conversationState:{pendingRequest:{action:'create_appointment',title:'Visita',durationMinutes:90}}};
 const i={action:'create_appointment',title:'Visita'};guardAppointmentDuration(i,'às nove',context);assert.equal(i.durationMinutes,90);
 const other={action:'create_appointment',title:'Outra visita'};guardAppointmentDuration(other,'às nove',context);assert.equal(other.durationMinutes,undefined);
});
test('contrato rejeita duração inválida e ações que não alteram o evento',()=>{
 for(const durationMinutes of [0,-1,1.5,1441,'60'])assert.throws(()=>parseInterpretation(JSON.stringify({action:'create_appointment',reply:'interno',durationMinutes})));
 assert.throws(()=>parseInterpretation(JSON.stringify({action:'set_appointment_alerts',reply:'interno',durationMinutes:30})));
 assert.equal(parseInterpretation(JSON.stringify({action:'reschedule_appointment',reply:'interno',durationMinutes:60})).durationMinutes,60);
 const i={action:'create_appointment',datetime:'2099-01-01T12:00:00Z'};guardAppointmentDuration(i,'reunião por 25 horas');assert.equal(i.action,'conversation');assert.equal(i.datetime,null);
});
test('mudar só duração mantém início e versão em vez de pedir outra data',async()=>{
 const appointment={id:'event',title:'Reunião',state:'active',startsAt:'2099-06-02T12:00:00Z',version:4};
 const r=await prepareConversation({text:'Muda essa reunião para durar duas horas',receivedAt:new Date('2099-06-01T15:00:00Z')},{buildContext:async()=>({conversationState:{focusedAppointment:appointment}}),interpret:async()=>({action:'conversation',reply:'interno'})});
 assert.equal(r.action,'reschedule_appointment');assert.equal(r.durationMinutes,120);assert.equal(r.datetime,'2099-06-02T12:00:00.000Z');assert.equal(r.expectedVersion,4);
});
