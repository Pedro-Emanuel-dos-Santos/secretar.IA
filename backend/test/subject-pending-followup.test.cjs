require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pendingResponse,pendingFollowupIntent}=require('../src/domain/subject.pending.followup.ts');
test('retorno extrai pessoa e próxima ação literal sem inferir conclusão',()=>{
 for(const text of ['O Evandro respondeu, agora falta revisar o contrato.','Evandro já retornou; agora preciso revisar o contrato','O Evandro deu retorno e agora vamos revisar o contrato'])assert.deepEqual(pendingResponse(text),{person:'evandro',nextAction:'revisar o contrato'});
 assert.equal(pendingResponse('João respondeu, agora falta conferir a documentação!').nextAction,'conferir a documentação');
 assert.deepEqual(pendingResponse('No projeto Piloto, o Evandro respondeu; agora falta revisar o contrato.'),{person:'evandro',nextAction:'revisar o contrato',subjectName:'Piloto',subjectKind:'project'});
 for(const text of ['O Evandro respondeu? Agora falta revisar o contrato?','O Evandro não respondeu, agora falta revisar o contrato','Se o Evandro respondeu, agora falta revisar o contrato','O Evandro respondeu, agora falta revisar amanhã','O Evandro respondeu, agora falta nada'])assert.equal(pendingResponse(text),null,text);
});
test('referência única gera atualização versionada; ambiguidade nunca vira criação',()=>{
 const ctx={recognized:true,nextAction:'revisar o contrato',subject:{id:'s',name:'Piloto',kind:'project'},candidates:[{id:'p',title:'Assinatura',version:2,state:'waiting',waitingFor:'Evandro'}]};const i=pendingFollowupIntent(ctx);
 assert.equal(i.action,'update_subject_pending');assert.equal(i.subjectPendingId,'p');assert.equal(i.expectedVersion,2);assert.equal(i.pendingState,'pending');assert.equal(i.nextAction,'revisar o contrato');
 for(const candidates of [[],[...ctx.candidates,...ctx.candidates]])assert.equal(pendingFollowupIntent({...ctx,candidates}).action,'conversation');assert.equal(pendingFollowupIntent(null),null);
});
