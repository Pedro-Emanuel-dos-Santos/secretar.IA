require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {subjectProposalCommand}=require('../src/domain/subject.proposal.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('confirmar e descartar atualização são comandos completos sem inferência de sim ou pergunta',async()=>{
 for(const text of ['CONFIRMAR ATUALIZAÇÃO','Confirmo a atualização.','Pode registrar a atualização!']){
  assert.equal(subjectProposalCommand(text).action,'confirm_subject_update');
  const result=await prepareConversation({phone:'5511999990000',phoneNumberId:'a',text,receivedAt:new Date()},{buildContext:async()=>assert.fail(),interpret:async()=>assert.fail()});assert.equal(result.action,'confirm_subject_update');
 }
 assert.equal(subjectProposalCommand('DESCARTAR ATUALIZAÇÃO').action,'discard_subject_update');
 for(const text of ['sim','ok','pode registrar','confirmar atualização?','não confirmar atualização','confirmar atualização e cancelar tarefa','se der, confirmar atualização'])assert.equal(subjectProposalCommand(text),null,text);
});
