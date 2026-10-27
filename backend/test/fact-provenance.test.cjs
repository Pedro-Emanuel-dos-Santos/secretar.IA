require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {factProvenance}=require('../src/domain/fact.provenance.ts');
test('pergunta de mudanças recupera versões do assunto em vez de responder do histórico livre',async()=>{
 const {prepareConversation}=require('../src/domain/conversation.processor.ts');
 const project={id:'p',name:'Avenida Beira Rio',kind:'project'};
 const deps={buildContext:async()=>({subjects:[project],conversationState:{focusedSubject:project}}),interpret:async()=>({action:'conversation',reply:'O contrato foi assinado.'})};
 for(const text of ['O que mudou no projeto Avenida Beira Rio?','Mostra o histórico desse projeto']){
  const i=await prepareConversation({phone:'5511999990000',phoneNumberId:'account',text,receivedAt:new Date()},deps);
  assert.equal(i.action,'search_facts');assert.equal(i.subject,project.name);assert.equal(i.subjectKind,'project');assert.equal(i.includeHistory,true);assert.equal(i.factKey,null);
 }
 const ambiguous=await prepareConversation({phone:'5511999990000',phoneNumberId:'account',text:'O que mudou no projeto desconhecido?',receivedAt:new Date()},deps);
 assert.equal(ambiguous.action,'conversation');assert.match(ambiguous.reply,/nome completo/);assert.doesNotMatch(ambiguous.reply,/assinado/);
});
test('origem usa data da mensagem no fuso do contato sem expor telefone ou texto',()=>{
 const fact={createdAt:new Date('2026-10-27T20:00:00Z'),sourceMessage:{receivedAt:new Date('2026-10-26T13:00:00Z'),phone:'5511999990000',phoneNumberId:'account'}};
 const text=factProvenance(fact,'5511999990000','account','America/Sao_Paulo');
 assert.equal(text,'Informado por você via WhatsApp em 26/10/2026, 10:00.');assert.doesNotMatch(text,/5511|account/);
});
test('registro legado e origem de outro contato ou conta não recebem atribuição falsa',()=>{
 for(const sourceMessage of [null,{receivedAt:new Date('2025-01-01'),phone:'other',phoneNumberId:'account'},{receivedAt:new Date('2025-01-01'),phone:'me',phoneNumberId:'other'}]){
  const text=factProvenance({createdAt:new Date('2026-10-27T13:00:00Z'),sourceMessage},'me','account','America/Sao_Paulo');
  assert.match(text,/Registrado em 27\/10\/2026, 10:00; origem da informação não identificada/);assert.doesNotMatch(text,/2025|Informado por você/);
 }
});
