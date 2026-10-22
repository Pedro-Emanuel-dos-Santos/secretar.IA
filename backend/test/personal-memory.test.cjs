require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {explicitPersonalMemoryRequest,personalMemoryReply}=require('../src/domain/personal.memory.ts');
const {localCommand}=require('../src/domain/local.commands.ts');
test('contrato da memória pessoal valida ações, tipos e identificadores',()=>{
 for(const action of ['remember_personal','recall_personal','update_personal','forget_personal'])assert.equal(parseInterpretation(JSON.stringify({action,reply:'interno',memoryKind:'routine',memoryId:'abc'})).action,action);
 for(const fields of [{memoryKind:'diagnosis'},{memoryId:{}},{memoryKind:123}])assert.throws(()=>parseInterpretation(JSON.stringify({action:'remember_personal',reply:'interno',...fields})));
});
test('pedido de memória distingue autorização de comentário e negação',()=>{
 for(const text of ['Guarda que prefiro a manhã','Anota que quero passear com meu filho','Pode guardar que não trabalho aos sábados?'])assert.equal(explicitPersonalMemoryRequest(text,'remember_personal'),true,text);
 for(const text of ['Eu gosto de sair cedo','Não guarde isso','Não quero que você guarde isso','Nunca anote essa informação'])assert.equal(explicitPersonalMemoryRequest(text,'remember_personal'),false,text);
 assert.equal(explicitPersonalMemoryRequest('Corrige minha rotina','update_personal'),true);assert.equal(explicitPersonalMemoryRequest('Esquece minha rotina','forget_personal'),true);
});
test('comandos de consentimento são completos e independem da IA',()=>{
 for(const [text,command] of [['MEMORIA PESSOAL','memory_info'],['ACEITO MEMORIA','memory_accept'],['DESATIVAR MEMORIA','memory_revoke'],['MINHAS MEMORIAS','memory_list']])assert.equal(localCommand(text),command);
 assert.equal(localCommand('não aceito memoria'),null);assert.equal(localCommand('aceito memoria e apaga tudo'),null);
});
test('resposta de memória é limitada e não afirma ações ou integração externa',()=>{
 assert.match(personalMemoryReply([]),/Não encontrei/);
 const result=personalMemoryReply(Array.from({length:11},(_,n)=>({label:'Rotina '+n,text:'x'.repeat(500)})));assert.ok(result.length<4096);assert.match(result,/mais informações/);
});
