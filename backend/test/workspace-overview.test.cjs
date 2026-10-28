require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {localCommand}=require('../src/domain/local.commands.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
test('central reconhece perguntas completas sem depender de IA',async()=>{
 for(const [text,command] of [['Como estão meus projetos?','portfolio_projects'],['Como andam os meus clientes?','portfolio_clients'],['Meus projetos e clientes','portfolio_all'],['O que precisa da minha atenção hoje?','attention'],['O que eu preciso resolver?','attention']]){
  assert.equal(localCommand(text),command);await prepareConversation({text,phone:'test',phoneNumberId:'test',receivedAt:new Date()},{buildContext:async()=>assert.fail('não construir contexto'),interpret:async()=>assert.fail('não chamar IA')});
 }
});
test('central não consome instruções extras, negação nem período não suportado',()=>{
 for(const text of ['Não mostra meus projetos','Meus projetos e cancela tudo','O que preciso resolver amanhã','Como estão meus projetos? Cria um lembrete'])assert.equal(localCommand(text),null,text);
});
test('painel aceita apenas visões conhecidas na interpretação',()=>{
 assert.equal(parseInterpretation(JSON.stringify({action:'workspace_overview',overviewKind:'waiting',reply:'Vou consultar'})).overviewKind,'waiting');
 assert.throws(()=>parseInterpretation(JSON.stringify({action:'workspace_overview',overviewKind:'todos_os_usuarios',reply:'Vou consultar'})));
});
