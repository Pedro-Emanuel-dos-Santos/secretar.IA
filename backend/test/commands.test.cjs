require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {localCommand}=require('../src/domain/local.commands.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {maximumLateness}=require('../src/domain/reminder.execution.ts');
test('comandos diretos não interpretam palavras dentro de um pedido como pausa',()=>{
 for(const text of ['PARAR','stop','Pausar lembretes!','Não quero receber lembretes'])assert.equal(localCommand(text),'pause');
 assert.equal(localCommand('Me lembra amanhã de parar na oficina'),null);
 assert.equal(localCommand('retomar a conversa com João amanhã'),null);
  assert.equal(localCommand('hoje'),null); // Can be an answer to a missing-date question.
});
test('ajuda, privacidade e pausa funcionam sem consultar IA',async()=>{
 for(const text of ['AJUDA','PRIVACIDADE','PARAR','RETOMAR']){
  const result=await prepareConversation({text,receivedAt:new Date()}, {buildContext:()=>assert.fail(),interpret:()=>assert.fail()});
  assert.equal(result.action,'conversation');
 }
});
test('tolerância de atraso tem padrão explícito e rejeita configurações sem limite',()=>{
 assert.equal(maximumLateness(''),3600000);
 for(const value of ['0','-1','1.5','Infinity','1441','abc'])assert.throws(()=>maximumLateness(value));
 assert.equal(maximumLateness('15'),900000);
});
test('recusa estruturada não é confundida com timeout ou aceitação incerta',()=>{
 const {providerRejection}=require('../src/domain/whatsapp.errors.ts');
 assert.equal(providerRejection(400,{error:{code:131030,message:'private'}}).code,131030);
 assert.equal(providerRejection(429,{error:{code:130429}}).httpStatus,429);
 for(const status of [200,408,500,502])assert.equal(providerRejection(status,{error:{code:1}}),null);
 assert.equal(providerRejection(400,{messages:[{id:'wamid'}],error:{code:1}}),null);
 assert.equal(providerRejection(400,'private'),null);
});
test('resumo usa dia de Brasília na virada UTC e respeita dia de 23 horas',()=>{
 const {brasiliaDay}=require('../src/domain/day.overview.ts');
 const day=brasiliaDay(new Date('2026-10-21T02:59:59Z'));
 assert.equal(day.start.toISOString(),'2026-10-20T03:00:00.000Z');assert.equal(day.end.toISOString(),'2026-10-21T03:00:00.000Z');
 const transition=brasiliaDay(new Date('2018-11-04T15:00:00Z'));
 assert.equal(transition.end-transition.start,23*3600000);
});
