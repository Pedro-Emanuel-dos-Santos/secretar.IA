require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const task={id:'task',state:'active',title:'Contrato',scheduleVersion:4,remindAt:'2099-06-02T12:30:00Z'};
const appointment={id:'event',state:'active',title:'Reunião Ana',version:2,startsAt:'2099-06-02T12:30:00Z'};
const prepare=(text,state,fields={})=>prepareConversation({text,phone:'test',phoneNumberId:'biz',receivedAt:new Date('2099-06-01T15:00:00Z')},{buildContext:async()=>({user:{timezone:'America/Sao_Paulo'},conversationState:state}),interpret:async()=>({action:'conversation',title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields})});
test('referência curta recupera tarefa e ignora ID inventado para cancelar ou concluir',async()=>{
 for(const [text,action] of [['cancela essa tarefa','cancel_reminder'],['conclui esse lembrete','complete_reminder'],['pode finalizar isso','complete_reminder']]){
  const r=await prepare(text,{focusedReminder:task},{reminderId:'wrong',search:'wrong'});
  assert.equal(r.action,action);assert.equal(r.reminderId,task.id);assert.equal(r.expectedVersion,4);assert.equal(r.search,null);assert.equal(r.cancelSeries,false);
 }
});
test('referência ao compromisso não usa lembrete e preserva dia ao mudar hora',async()=>{
 const r=await prepare('muda aquela reunião para às dez',{focusedAppointment:appointment},{action:'create_reminder',datetime:'2099-06-09T13:00:00Z',alertMinutes:[0]});
 assert.equal(r.action,'reschedule_appointment');assert.equal(r.appointmentId,'event');assert.equal(r.reminderId,null);assert.equal(r.datetime,'2099-06-02T13:00:00.000Z');assert.equal(r.expectedVersion,2);
 assert.equal(r.alertMinutes,undefined);
 const cancelled=await prepare('cancela esse compromisso',{focusedAppointment:appointment});assert.equal(cancelled.action,'cancel_appointment');
});
test('referência curta com dia mantém hora e rejeita dois focos ou tipo diferente',async()=>{
 const r=await prepare('adia esse lembrete para depois de amanhã',{focusedReminder:task});assert.equal(r.datetime,'2099-06-03T12:30:00.000Z');
 for(const state of [{},{focusedReminder:task,focusedAppointment:appointment},{focusedReminder:{...task,state:'completed'}},{focusedAppointment:appointment}]){
  const rejected=await prepare('cancela essa tarefa',state,{action:'cancel_reminder',reminderId:'wrong'});
  assert.equal(rejected.action,'conversation');assert.equal(rejected.reminderId,null);assert.match(rejected.reply,/Qual/);
 }
});
test('negação, pergunta, condição e título adicional não acionam referência curta',async()=>{
 for(const text of ['não cancela essa tarefa','cancela essa tarefa?','se puder cancela essa','cancela essa tarefa do orçamento','cancela essa e cria outra','talvez cancela essa']){
  const r=await prepare(text,{focusedReminder:task});assert.equal(r.action,'conversation',text);
 }
});
test('rascunho e seleção explícita não são substituídos pelo foco anterior',async()=>{
 const r=await prepare('adia esse para amanhã',{focusedReminder:task,pendingRequest:{draft:{date:null,time:'10:00'}}});assert.equal(r.action,'conversation');
 const list={id:'list',items:[{id:'selected',version:6,title:'Escolhida'}]},selectedTask={id:'focus',index:0,list};
 const selected=await prepare('conclui essa tarefa',{focusedReminder:task,selectedTask},{action:'complete_reminder'});
 assert.equal(selected.reminderId,'selected');assert.equal(selected.selectionFocusId,'focus');assert.equal(selected.expectedVersion,6);
});
test('modelo que ignora negação ou pergunta não executa alteração de referência curta',async()=>{
 for(const text of ['não cancela essa tarefa','cancela essa tarefa?','talvez cancela essa']){
  const r=await prepare(text,{focusedReminder:task},{action:'cancel_reminder',reminderId:task.id});assert.equal(r.action,'conversation');assert.equal(r.reminderId,null);
 }
});
test('reunião não é substituída silenciosamente por visita em foco',async()=>{
 const r=await prepare('muda aquela reunião para amanhã',{focusedAppointment:{...appointment,title:'Visita Ana'}},{action:'reschedule_appointment',appointmentId:'another',datetime:'2099-06-03T12:30:00Z'});assert.equal(r.action,'conversation');assert.equal(r.appointmentId,null);
});
