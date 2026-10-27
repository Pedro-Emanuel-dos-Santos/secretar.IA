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

test('hora curta usa relógio escrito apesar de offset errado ou ausente da IA',async()=>{
 for(const datetime of ['2099-06-09T16:00:00Z',null]){
  for(const [text,expected] of [['Melhor às dez','13:00'],['Melhor nove e meia','12:30'],['10h','13:00'],['10:30','13:30'],['duas e vinte e cinco da tarde','17:25'],['oito da noite','23:00'],['Melhor às meio-dia','15:00'],['às meia-noite','03:00']]){
   const r=await prepare(text,{datetime});assert.equal(r.datetime,`2099-06-02T${expected}:00.000Z`,text);assert.equal(r.expectedVersion,3);
  }
 }
 const ctx={user:context.user,appointments:[appointment],conversationState:{focusedAppointment:appointment}};
 const r=await prepare('Melhor às dez',{action:'create_appointment',reminderId:null,appointmentId:null,datetime:'2099-06-09T16:00:00Z'},ctx);
 assert.equal(r.action,'reschedule_appointment');assert.equal(r.appointmentId,appointment.id);assert.equal(r.datetime,'2099-06-02T13:00:00.000Z');assert.equal(r.expectedVersion,5);
});

test('relógio explícito inválido, múltiplo ou ambíguo de DST não usa palpite do modelo',async()=>{
 for(const text of ['Melhor às 25','Melhor 10:75','Melhor às nove ou às dez','Melhor às doze da manhã','Melhor às doze da noite'])assert.equal((await prepare(text,{datetime:'2099-06-02T13:00:00Z'})).datetime,null,text);
 const ny={user:{timezone:'America/New_York'},reminders:[{...task,remindAt:'2027-11-07T05:00:00Z'}]};
 assert.equal((await prepare('às uma e meia',{datetime:'2027-11-07T06:30:00Z'},ny)).datetime,null);
});
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

test('correção curta de dia recupera tarefa sem duplicar e preserva hora e versão',async()=>{
 const ctx={user:context.user,reminders:[task],conversationState:{focusedReminder:task}};
 for(const action of ['conversation','create_reminder','create_appointment']){
  const r=await prepare('Melhor depois de amanhã.',{action,reminderId:null,datetime:'2099-06-09T03:00:00Z'},ctx);
  assert.equal(r.action,'reschedule_reminder');assert.equal(r.reminderId,'task');
  assert.equal(r.datetime,'2099-06-03T12:30:00.000Z');assert.equal(r.expectedVersion,3);
 }
});

test('correção curta de dia recupera compromisso e não reaproveita rascunho',async()=>{
 const ctx={user:context.user,appointments:[appointment],conversationState:{focusedAppointment:appointment}};
 const r=await prepare('Na verdade, pra amanhã!',{action:'create_appointment',reminderId:null,appointmentId:null,draft:{date:'2099-06-09',time:null}},ctx);
 assert.equal(r.action,'reschedule_appointment');assert.equal(r.appointmentId,'event');
 assert.equal(r.datetime,'2099-06-02T12:30:00.000Z');assert.equal(r.expectedVersion,5);assert.equal(r.draft,undefined);
});

test('correção curta sem referência única pergunta sem alterar ou criar',async()=>{
 for(const ctx of [context,{}, {conversationState:{focusedReminder:{...task,state:'cancelled'}}}]){
  const r=await prepare('Melhor amanhã',{action:'create_reminder',reminderId:null},ctx);
  assert.equal(r.action,'conversation');assert.equal(r.datetime,null);assert.equal(r.reminderId,null);assert.match(r.reply,/\?/);
 }
});

test('comentário, negação e pedido adicional não são convertidos em correção de dia',async()=>{
 for(const text of ['Melhor amanhã?', 'Não, melhor amanhã', 'Melhor amanhã eu vejo isso', 'Melhor amanhã, cria outra tarefa']){
  const r=await prepare(text,{action:'conversation',reminderId:null}, {conversationState:{focusedReminder:task}});
  assert.equal(r.action,'conversation');assert.equal(r.reminderId,null);
 }
});

test('dia que completa rascunho não muda tarefa antiga em foco',async()=>{
 const ctx={user:context.user,conversationState:{focusedReminder:task,pendingRequest:{action:'create_reminder',draft:{date:null,time:'10:00'}}}};
 const r=await prepare('Melhor amanhã',{action:'create_reminder',reminderId:null,title:'Outra tarefa',datetime:'2099-06-02T13:00:00Z'},ctx);
 assert.equal(r.action,'create_reminder');assert.equal(r.reminderId,null);assert.equal(r.datetime,'2099-06-02T13:00:00Z');
});

test('período vago preserva dia para perguntar só a hora e resposta curta completa esse dia',async()=>{
 const first=await prepare('Passa para quinta de manhã');assert.equal(first.datetime,null);assert.deepEqual(first.draft,{date:'2099-06-04',time:null});
 const ctx={...context,conversationState:{focusedReminder:task,pendingRequest:{action:'reschedule_reminder',reminderId:task.id,draft:first.draft}}};
 const completed=await prepare('às nove',{datetime:'2099-06-09T12:00:00Z'},ctx);assert.equal(completed.datetime,'2099-06-04T12:00:00.000Z');assert.equal(completed.expectedVersion,3);
 const unrelated=await prepare('às nove',{datetime:'2099-06-09T12:00:00Z'},{...ctx,conversationState:{...ctx.conversationState,pendingRequest:{...ctx.conversationState.pendingRequest,reminderId:'other'}}});assert.equal(unrelated.datetime,'2099-06-02T12:00:00.000Z');
});
test('hora que completa reagendamento de compromisso respeita data do rascunho',async()=>{
 const ctx={...context,conversationState:{focusedAppointment:appointment,pendingRequest:{action:'reschedule_appointment',appointmentId:appointment.id,draft:{date:'2099-06-04',time:null}}}};
 const completed=await prepare('às nove',{action:'reschedule_appointment',reminderId:null,appointmentId:appointment.id,datetime:'2099-06-09T12:00:00Z'},ctx);assert.equal(completed.datetime,'2099-06-04T12:00:00.000Z');assert.equal(completed.expectedVersion,5);
});
test('período vago com dias conflitantes não guarda um dia escolhido pela IA',async()=>{
 const r=await prepare('Passa para amanhã ou depois de amanhã de manhã',{draft:{date:'2099-06-02',time:'09:00'}});assert.equal(r.datetime,null);assert.equal(r.draft,null);
});
