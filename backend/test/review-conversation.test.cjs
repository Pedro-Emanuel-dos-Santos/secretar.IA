require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {guardAppointmentDuration,statedAppointmentDuration}=require('../src/domain/appointment.duration.ts');
const appointment={id:'event',title:'Reunião',state:'active',startsAt:'2099-06-02T12:00:00Z',version:4};
const reminder={id:'task',title:'Ligar',state:'active',remindAt:'2099-06-02T12:00:00Z',scheduleVersion:4};
test('revisão: pergunta e proposta incerta não reagendam item em foco apesar da classificação da IA',async()=>{
 for(const [focused,action] of [[{focusedAppointment:appointment},'create_appointment'],[{focusedReminder:reminder},'create_reminder']]){
  for(const text of ['Melhor nove e meia?','Na verdade, às dez?','Melhor às dez se der']){
   const r=await prepareConversation({phone:'5511999990000',phoneNumberId:'a',text,receivedAt:new Date('2099-06-01T15:00:00Z')},{buildContext:async()=>({conversationState:focused}),interpret:async()=>({action,title:'Reunião',datetime:'2099-06-02T12:30:00Z',reply:'interno'})});
   assert.equal(r.action,'conversation',text);assert.equal(r.datetime,null);assert.equal(r.appointmentId,null);assert.equal(r.reminderId,null);
  }
 }
});
test('revisão: duração composta ocupa todo o período e não trunca continuação inválida',()=>{
 for(const [text,expected] of [['Reunião por uma hora e trinta minutos',90],['Consulta com duração de 1 hora e 15 minutos',75],['Reunião por uma hora e meia',90]]){
  assert.equal(statedAppointmentDuration(text),expected);const i={action:'create_appointment',durationMinutes:1};guardAppointmentDuration(i,text);assert.equal(i.durationMinutes,expected);
 }
 for(const text of ['Reunião por uma hora e vinte e cinco minutos','Reunião por uma hora, não, por duas horas','Reunião por uma hora e 15 horas','Reunião por uma hora e 15']){const i={action:'create_appointment',durationMinutes:60};guardAppointmentDuration(i,text);assert.equal(i.action,'conversation');assert.equal(i.durationMinutes,undefined);}
});
test('revisão: intervalo explícito tem duração determinística e horário ambíguo pede esclarecimento',async()=>{
 const r=await prepareConversation({phone:'5511999990000',phoneNumberId:'a',text:'Reunião amanhã das 9 às 10',receivedAt:new Date('2099-06-01T15:00:00Z')},{buildContext:async()=>({user:{timezone:'America/Sao_Paulo'}}),interpret:async()=>({action:'create_appointment',title:'Reunião',datetime:'2099-06-02T12:00:00Z',durationMinutes:4,reply:'interno'})});
 assert.equal(r.action,'create_appointment');assert.equal(r.durationMinutes,60);
 const hours={action:'create_appointment',datetime:'2099-06-02T12:00:00Z'};guardAppointmentDuration(hours,'Reunião das 9h às 10h');assert.equal(hours.durationMinutes,60);
 for(const text of ['Reunião das 11 às 2','Reunião das 23 às 1','Reunião das 9 às 10 da noite','Reunião das 25 às 26','Reunião das 9 às 10 e das 11 às 12']){const i={action:'create_appointment',datetime:'2099-06-02T12:00:00Z'};guardAppointmentDuration(i,text);assert.equal(i.action,'conversation',text);}
 const wrongStart={action:'create_appointment',datetime:'2099-06-02T13:00:00Z'};guardAppointmentDuration(wrongStart,'Reunião das 9 às 10');assert.equal(wrongStart.action,'conversation');
});
test('revisão: intervalo não inventa horário inexistente ou ambíguo durante transição de fuso',()=>{
 for(const datetime of ['2026-11-01T05:00:00Z','2026-11-01T06:00:00Z']){const i={action:'create_appointment',datetime};guardAppointmentDuration(i,'Reunião das 1 às 2',{user:{timezone:'America/New_York'}});assert.equal(i.action,'conversation');}
 for(const [datetime,text] of [['2026-03-08T06:00:00Z','Reunião das 1 às 2'],['2026-11-01T04:00:00Z','Reunião das 0 às 1']]){const i={action:'create_appointment',datetime};guardAppointmentDuration(i,text,{user:{timezone:'America/New_York'}});assert.equal(i.action,'conversation');}
});
test('revisão: resposta curta de duração só continua o rascunho compatível e não confunde antecedência',()=>{
 const context={conversationState:{pendingRequest:{action:'create_appointment',title:'Visita'}}};
 const i={action:'create_appointment',title:'Visita'};guardAppointmentDuration(i,'uma hora',context);assert.equal(i.durationMinutes,60);
 const other={action:'create_appointment',title:'Outra'};guardAppointmentDuration(other,'uma hora',context);assert.equal(other.durationMinutes,undefined);
 const lead={action:'create_appointment',title:'Visita',durationMinutes:60};guardAppointmentDuration(lead,'me avise uma hora antes');assert.equal(lead.durationMinutes,undefined);
});
