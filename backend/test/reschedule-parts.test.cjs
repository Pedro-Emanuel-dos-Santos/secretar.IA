require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const now=new Date('2099-06-01T15:00:00Z');
const task={id:'task',title:'Enviar orçamento',state:'active',remindAt:'2099-06-02T12:30:00Z',scheduleVersion:3};
const appointment={id:'event',title:'Visita Ana',state:'active',startsAt:'2099-06-02T12:30:00Z',version:5};
const context={user:{timezone:'America/Sao_Paulo'},reminders:[task],appointments:[appointment],conversationState:{focusedReminder:task,focusedAppointment:appointment}};
async function prepare(text,fields={},ctx=context,receivedAt=now){return prepareConversation({phone:'test',phoneNumberId:'biz',text,receivedAt},{buildContext:async()=>ctx,interpret:async()=>({action:'reschedule_reminder',reminderId:'task',reply:'interno',datetime:'2099-06-09T03:00:00Z',...fields})});}
test('mudar somente dia preserva nove e meia e usa data da mensagem original',async()=>{
 const r=await prepare('Passa para amanhã');assert.equal(r.datetime,'2099-06-02T12:30:00.000Z');
 const without=await prepare('Passa para amanhã',{datetime:null});assert.equal(without.datetime,r.datetime);
 const after=await prepare('Passa para depois de amanhã');assert.equal(after.datetime,'2099-06-03T12:30:00.000Z');
});
test('dia da semana preserva hora do compromisso e mesma semana avança sete dias',async()=>{
 const r=await prepare('Passa a visita para quinta',{action:'reschedule_appointment',reminderId:null,appointmentId:'event'});const d=new Date(r.datetime);assert.equal(d.getUTCDay(),4);assert.equal(d.getUTCHours(),12);assert.equal(d.getUTCMinutes(),30);
 const same=await prepare('Passa para quinta',{},context,new Date('2099-06-04T15:00:00Z'));assert.equal(same.datetime,'2099-06-11T12:30:00.000Z');
});
test('somente hora mantém dia antigo mesmo quando o modelo muda o dia',async()=>{const r=await prepare('Melhor às dez',{datetime:'2099-06-09T13:00:00Z'});assert.equal(r.datetime,'2099-06-02T13:00:00.000Z');assert.equal(r.expectedVersion,3);});
test('correção de criação para compromisso preserva dia e não cria novo evento',async()=>{const r=await prepare('Melhor às dez',{action:'create_appointment',appointmentId:null,reminderId:null,title:'Visita Ana',datetime:'2099-06-09T13:00:00Z'});assert.equal(r.action,'reschedule_appointment');assert.equal(r.appointmentId,'event');assert.equal(r.datetime,'2099-06-02T13:00:00.000Z');});
test('sem alvo exato não aproveita hora de outra tarefa',async()=>{const r=await prepare('Passa para amanhã',{reminderId:'unknown'});assert.equal(r.datetime,null);});
test('dia e hora explícitos continuam disponíveis sem substituição de partes',async()=>{const r=await prepare('Passa para amanhã às dez',{datetime:'2099-06-02T13:00:00Z'});assert.equal(r.datetime,'2099-06-02T13:00:00Z');});
test('dia falado e semana qualificada não são trocados pelo dia antigo ou pela quinta mais próxima',async()=>{
 const spoken=await prepare('Passa para dia cinco às dez',{datetime:'2099-06-05T13:00:00Z'});assert.equal(spoken.datetime,'2099-06-05T13:00:00Z');
 const qualified=await prepare('Passa para quinta da outra semana',{datetime:'2099-06-11T03:00:00Z'});assert.equal(qualified.datetime,'2099-06-11T12:30:00.000Z');
});
test('período vago ou correção sem data e hora pede informação em vez de preservar hora errada',async()=>{for(const text of ['Passa para quinta de manhã','Muda esse horário','Passa para outra hora'])assert.equal((await prepare(text)).datetime,null);});
test('preserva hora local ao mudar offset e recusa horário inexistente ou ambíguo',async()=>{
 const make=remindAt=>({user:{timezone:'America/New_York'},reminders:[{...task,remindAt}]});
 const spring=await prepare('Passa para amanhã',{datetime:null},make('2027-03-13T14:30:00Z'),new Date('2027-03-13T15:00:00Z'));assert.equal(spring.datetime,'2027-03-14T13:30:00.000Z');
 const missing=await prepare('Passa para amanhã',{datetime:null},make('2027-03-13T07:30:00Z'),new Date('2027-03-13T15:00:00Z'));assert.equal(missing.datetime,null);
 const ambiguous=await prepare('Passa para amanhã',{datetime:null},make('2027-11-06T05:30:00Z'),new Date('2027-11-06T15:00:00Z'));assert.equal(ambiguous.datetime,null);
});
test('duração relativa continua resolvida a partir do recebimento',async()=>{const r=await prepare('Adia por um minuto');assert.equal(r.datetime,'2099-06-01T15:01:00.000Z');});
