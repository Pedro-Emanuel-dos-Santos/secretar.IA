require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {contextFeatures,contextScore}=require('../src/domain/context.relevance.ts');
const {contextualRecallCommand}=require('../src/domain/context.recall.ts');
const {guardContextCorrection}=require('../src/domain/context.guards.ts');
const {formatReminderReply}=require('../src/domain/action.executor.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
test('conceitos recuperam paráfrases sem palavras idênticas, sem relacionar tudo a tudo',()=>{
 assert.ok(contextScore('trabalho','Estou em busca de emprego').score>=4);
 assert.ok(contextScore('programação','Desenvolvimento de software').score>=4);
 assert.ok(contextScore('cotação','Orçamento do fornecedor').score>=4);
 assert.equal(contextScore('entrevista','consulta de pressão arterial').score,0);
 assert.equal(contextScore('você lembra da minha área?','contrato assinado').score,0);
 assert.ok(contextFeatures('x '.repeat(2000)).terms.length<=48);
});
test('consulta explícita de memória dispensa modelo e pedido misto não perde a segunda parte',async()=>{
 const text='Você lembra da área em que estou procurando trabalho?';
 assert.equal(contextualRecallCommand(text).action,'recall_context');
 assert.equal(contextualRecallCommand('Você lembra do orçamento e me avisa amanhã?'),null);
 const result=await prepareConversation({phone:'fixture',phoneNumberId:'fixture',text,receivedAt:new Date()},{buildContext:()=>assert.fail(),interpret:()=>assert.fail()});assert.equal(result.action,'recall_context');assert.equal(result.search,text);
});
test('similaridade antiga não autoriza correção sem foco, mas foco único usa identidade e versão atuais',()=>{
 const correction=()=>({action:'reschedule_appointment',appointmentId:'invented',datetime:'2099-01-01T16:00:00Z',reply:'interno'});
 const missing=correction();guardContextCorrection(missing,'Na verdade, mudou para as 16h',{contextualMemory:{items:[{id:'old',kind:'appointment'}]},appointments:[{id:'old',title:'Reunião'}]});assert.equal(missing.action,'conversation');assert.equal(missing.appointmentId,null);
 const focused=correction();guardContextCorrection(focused,'Na verdade, mudou para as 16h',{conversationState:{focusedAppointment:{id:'actual',state:'active',version:7}}});assert.equal(focused.appointmentId,'actual');assert.equal(focused.expectedVersion,7);
});
test('estados de retry e configuração nunca prometem entrega como se estivessem agendados',()=>{
 for(const status of ['delivery_retry','retry_exhausted','blocked_configuration'])assert.doesNotMatch(formatReminderReply({title:'fixture',remindAt:new Date('2099-01-01'),status}),/eu te lembro/);
});
test('edição de memória recuperada fora do preview usa versão do banco, nunca a inventada pelo modelo',async()=>{
 for(const [kind,action,key] of [['personal','update_personal','memoryId'],['note','edit_note','noteId']]){
  const intent=await prepareConversation({phone:'fixture',phoneNumberId:'fixture',text:'Atualiza a anotação da carreira.',receivedAt:new Date()},{buildContext:async()=>({contextualMemory:{items:[{kind,id:'actual',version:4}]}}),interpret:async()=>({action,reply:'interno',[key]:'actual',expectedVersion:99,description:'Texto novo'})});assert.equal(intent.expectedVersion,4);
 }
});
