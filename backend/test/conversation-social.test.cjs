require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {socialAcknowledgement}=require('../src/domain/conversation.social.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('agradecimento completo não retoma uma alteração nem consulta IA',async()=>{
 const result=await prepareConversation({phone:'5551999999999',phoneNumberId:'test',receivedAt:new Date(),text:'Valeu!!!'},
  {buildContext:async()=>assert.fail('No context needed'),interpret:async()=>assert.fail('No paid call needed')});
 assert.equal(result.action,'conversation');assert.equal(result.datetime,null);assert.equal(result.reply,'De nada!');
});
test('agradecimento com pedido, horário ou negação continua para interpretação',()=>{
 for(const text of ['Valeu, e amanhã o que tenho?','Obrigado, cancela a reunião','Valeu às dez','Não obrigado','Obrigado?','Show, me lembra daqui a um minuto','Muito obrigado; pode concluir'])assert.equal(socialAcknowledgement(text),null,text);
 for(const text of ['Obrigada!','Muito obrigado.','VALEU demais','Show, obrigado pela força!'])assert.equal(socialAcknowledgement(text)?.action,'conversation',text);
});
