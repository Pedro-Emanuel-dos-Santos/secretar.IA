require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {executeAction}=require('../src/domain/action.executor.ts');
test('ações de pendência aceitam somente estados e próxima ação válidos',()=>{
 const base={action:'create_subject_pending',reply:'interno',title:'Contrato',subject:'Projeto',subjectKind:'project',nextAction:'Cobrar retorno',pendingState:'waiting',waitingFor:'Evandro'};
 const valid=parseInterpretation(JSON.stringify(base));assert.equal(valid.nextAction,'Cobrar retorno');assert.equal(valid.pendingState,'waiting');
 for(const extra of [{pendingState:'approved'},{pendingState:3},{nextAction:{}},{nextAction:' '},{nextAction:'a'.repeat(301)}])assert.throws(()=>parseInterpretation(JSON.stringify({...base,...extra})));
});
test('ação de pendência usa resultado do executor em vez de confirmação da IA',async()=>{
 let count=0;const reply=await executeAction('5511999990000',parseInterpretation(JSON.stringify({action:'create_subject_pending',reply:'Já enviei a cobrança!'})),async()=>assert.fail(),undefined,undefined,async()=>{count++;return 'Pendência registrada sem aviso.';});
 assert.equal(reply,'Pendência registrada sem aviso.');assert.equal(count,1);
});
test('referência de pendências conserva projeto explícito e recusa pronome sem foco',async()=>{
 const {prepareConversation}=require('../src/domain/conversation.processor.ts');
 const a={id:'a',name:'Avenida Beira Rio',kind:'project'},b={id:'b',name:'Projeto Sul',kind:'project'};
 const run=(text,context,action='list_subject_pendings')=>prepareConversation({phone:'5511999990000',phoneNumberId:'account',text,receivedAt:new Date()},{buildContext:async()=>context,interpret:async()=>({action,reply:'interno',subject:b.name,subjectKind:'project'})});
 const explicit=await run('Registra uma pendência do projeto Avenida Beira Rio',{subjects:[a,b]},'create_subject_pending');assert.equal(explicit.subject,a.name);
 const pronoun=await run('Mostra as pendências desse projeto',{subjects:[a,b],conversationState:{focusedSubject:a}});assert.equal(pronoun.subject,a.name);
 const missing=await run('Mostra as pendências desse projeto',{subjects:[a,b]});assert.equal(missing.action,'conversation');assert.equal(missing.subject,null);
 const ambiguous=await run('Atualiza a pendência de Avenida Beira Rio e Projeto Sul',{subjects:[a,b]},'update_subject_pending');assert.equal(ambiguous.action,'conversation');
});
