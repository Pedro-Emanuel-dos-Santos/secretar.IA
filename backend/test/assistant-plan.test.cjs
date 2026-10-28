require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {assistantPlanCommand}=require('../src/domain/assistant.plan.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const note={action:'save_note',description:'Guardar o que combinamos'},reminder={action:'create_reminder',title:'Ligar',datetime:'2099-06-01T13:00:00Z'};
test('plano aceita conjunto limitado de criações e recusa operações destrutivas ou aninhadas',()=>{
 const parse=steps=>parseInterpretation(JSON.stringify({action:'assistant_plan',reply:'Uma proposta',planSteps:steps}));
 assert.equal(parse([note,reminder]).planSteps.length,2);
 assert.equal(parseInterpretation(JSON.stringify({action:'assistant_plan',planSteps:[note,reminder]})).planSteps.length,2);
 assert.throws(()=>parseInterpretation(JSON.stringify({action:'conversation'})));
 const nullable=parseInterpretation(JSON.stringify({action:'assistant_plan',reply:'Proposta',alertMinutes:null,planSteps:[{...note,alertMinutes:null},{...reminder,alertMinutes:null}]}));assert.equal(nullable.planSteps[1].alertMinutes,undefined);
 for(const steps of [[note],Array(6).fill(note),[note,{action:'delete_note'}],[note,{action:'assistant_plan',planSteps:[note,reminder]}],[note,{...reminder,recurrence:{frequency:'daily',count:3}}],[note,{...reminder,alertMinutes:[15]}],[{...note,datetime:'2099-06-01T13:00:00Z'},reminder]])assert.throws(()=>parse(steps));
 assert.equal(parseInterpretation(JSON.stringify({action:'conversation',reply:'Vamos pensar juntos',planSteps:null})).action,'conversation');
});
test('confirmação exige mensagem completa e atual; conteúdo citado não confirma',()=>{
 for(const text of ['sim','pode fazer','Sim, pode fazer','confirmar plano','Beleza, pode fazer','Bora','manda bala','faz isso pra mim, por favor'])assert.equal(assistantPlanCommand(text),'confirm_assistant_plan');
 for(const text of ['pode fazer?','não pode fazer','O documento diz pode fazer','sim, mas troca o horário'])assert.equal(assistantPlanCommand(text),null,text);
 assert.equal(assistantPlanCommand('descartar plano'),'discard_assistant_plan');
});
test('modelo não pode inventar confirmação e sim sem plano continua a conversa normal',async()=>{
 const message={phone:'5511999990000',phoneNumberId:'test',text:'sim',receivedAt:new Date()};
 const blocked=await prepareConversation(message,{buildContext:async()=>({}),interpret:async()=>({action:'confirm_assistant_plan',reply:'Executei'})});assert.equal(blocked.action,'conversation');assert.match(blocked.reply,/Ainda não executei/);
 const normal=await prepareConversation(message,{buildContext:async()=>({}),interpret:async()=>({action:'conversation',reply:'Como posso ajudar?'})});assert.equal(normal.reply,'Como posso ajudar?');
 const confirmation=await prepareConversation(message,{buildContext:async()=>({conversationState:{assistantPlan:{id:'server-plan'}}}),interpret:async()=>assert.fail('confirmação não usa IA')});assert.equal(confirmation.action,'confirm_assistant_plan');
});
