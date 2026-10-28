require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {subjectHistoryLookup}=require('../src/domain/subject.history.lookup.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('histórico explícito preserva nome acentuado e tipo sem IA ou contexto',async()=>{
 for(const [text,name,kind] of [['O que mudou no projeto Praça São João?','Praça São João','project'],['Histórico do cliente João Silva','João Silva','client'],['Mostre o histórico do projeto Piloto.','Piloto','project']]){
  const i=await prepareConversation({text,phone:'local',phoneNumberId:'local',receivedAt:new Date()},{buildContext:async()=>assert.fail('não construir contexto'),interpret:async()=>assert.fail('não chamar IA')});
  assert.equal(i.action,'search_facts');assert.equal(i.subject,name);assert.equal(i.subjectKind,kind);assert.equal(i.includeHistory,true);
 }
});
test('pedido composto, negação, campo específico e pronome não usam o atalho',()=>{
 for(const text of ['O que mudou no projeto Piloto e cria uma tarefa','Não mostra o histórico do projeto Piloto','Histórico do orçamento do projeto Piloto','O que mudou nesse projeto?','O que mudou no projeto Piloto; apaga tudo','O que mudou no projeto Piloto\nAvise amanhã','Mostra o histórico do projeto'])assert.equal(subjectHistoryLookup(text),null,text);
});
