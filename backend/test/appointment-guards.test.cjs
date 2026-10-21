require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const base={action:'create_appointment',title:'Reunião com João',description:null,datetime:'2099-05-02T09:00:00-03:00',amount:null,category:null,reply:'interno'};
const prepare=(text,context={},fields={})=>prepareConversation({text,receivedAt:new Date('2099-05-01T15:00:00Z')},{buildContext:async()=>context,interpret:async()=>({...base,...fields})});
test('hora sem dia vira rascunho com hora preservada em vez de aceitar dia inventado',async()=>{
 for(const action of ['create_appointment','create_reminder']){
  const result=await prepare('Marca reunião às nove.',{}, {action});
  assert.equal(result.datetime,null);assert.deepEqual(result.draft,{date:null,time:'09:00'});
 }
});
test('dia explícito e dia pendente permitem completar a hora',async()=>{
 for(const text of ['Marca reunião amanhã às nove.','Marca reunião em 2 de maio às nove.','Marca reunião dia 2 às nove.','Marca reunião em 2099-05-02 às nove.','Marca reunião daqui a dois dias às nove.'])assert.equal((await prepare(text)).datetime,base.datetime,text);
 const result=await prepare('Às nove.',{conversationState:{pendingRequest:{draft:{date:'2099-05-02',time:null}}}});
 assert.equal(result.datetime,base.datetime);
});
test('duração relativa simples continua resolvida sem exigir dia separado',async()=>{
 const result=await prepare('Marca reunião daqui a um minuto.');assert.equal(result.datetime,'2099-05-01T15:01:00.000Z');
});
test('referência explícita ao mesmo dia aceita dia do compromisso em foco',async()=>{
 const result=await prepare('Marca visita no mesmo dia às nove.',{conversationState:{focusedAppointment:{startsAt:'2099-05-02T10:00:00-03:00'}}});
 assert.equal(result.datetime,base.datetime);
 assert.equal((await prepare('Marca visita às nove.',{conversationState:{focusedAppointment:{startsAt:'2099-05-02T10:00:00-03:00'}}})).datetime,null);
});
test('duas reuniões ou reunião e visita pedem escolha sem salvar primeira como pedido inteiro',async()=>{
 for(const text of ['Amanhã reunião com João às 9h e visita ao cliente às 16h.','Amanhã reunião às nove e outra reunião às dez.']){
  const result=await prepare(text);assert.equal(result.action,'conversation');assert.match(result.reply,/mais de um compromisso/);
 }
});
test('uma reunião com múltiplos horários de aviso continua permitida',async()=>{
 for(const text of ['Reunião amanhã às dez, avisa às nove e às dez.','Reunião amanhã às dez e me avisa às nove.']){
  const result=await prepare(text,{}, {alertMinutes:[60,0]});assert.equal(result.action,'create_appointment');assert.equal(result.datetime,base.datetime);
 }
});
