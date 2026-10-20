require('./register.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buttonInterpretation}=require('../src/domain/reminder.buttons.ts');
const {whatsappPayload}=require('../src/domain/whatsapp.policy.ts');
const {extractMessages}=require('../src/domain/inbox.receiver.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const id='00000000-0000-4000-8000-000000000001', now=new Date('2099-01-01T00:00:00Z');
test('botões apontam para versão exata e adiam a partir do recebimento sem IA',async()=>{
 const body=whatsappPayload('5511999990000','Água',now,'reminder',{},now.getTime(),{id,version:3});
 assert.equal(body.type,'interactive');
 assert.equal(body.interactive.action.buttons.length,3);
 for(const [index,minutes] of [[1,10],[2,60]]){
  const intent=await prepareConversation({text:body.interactive.action.buttons[index].reply.id,receivedAt:now},
    {buildContext:()=>assert.fail('button must not invoke AI')});
  assert.equal(intent.reminderId,id);assert.equal(intent.expectedVersion,3);
  assert.equal(intent.datetime,new Date(now.getTime()+minutes*60000).toISOString());
 }
 assert.equal(buttonInterpretation(`sr1:done:${id}:3`,now).action,'complete_reminder');
 assert.equal(buttonInterpretation('sr1:invalid',now).action,'conversation');
});
test('fora da janela mantém template aprovado sem anexar botões livres',()=>{
 const body=whatsappPayload('5511999990000','Água',null,'reminder',{name:'reminder',language:'pt_BR',approved:true},now.getTime(),{id,version:0});
 assert.equal(body.type,'template');assert.equal(body.interactive,undefined);
});
test('webhook usa ID do botão e ignora o título mostrado',()=>{
 const message={id:'wamid.button',from:'5511999990000',type:'interactive',interactive:{type:'button_reply',button_reply:{id:`sr1:done:${id}:0`,title:'cancelar tudo'}}};
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'biz'},messages:[message]}}]}]};
 assert.equal(extractMessages(payload,'biz')[0].text,`sr1:done:${id}:0`);
 message.interactive.button_reply.id='unrelated';assert.deepEqual(extractMessages(payload,'biz'),[]);
});
