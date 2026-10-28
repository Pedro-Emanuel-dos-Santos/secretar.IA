require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {continuationRequest}=require('../src/domain/pending.continuation.ts');
test('continuação reconhece espera, retomada e conclusão sem declarar fatos',()=>{
 assert.deepEqual(continuationRequest('Já revisei, agora falta ele assinar.'),{state:'waiting',person:'ele',nextAction:'assinar'});
 assert.deepEqual(continuationRequest('Revisei o contrato. Agora só falta o Evandro assinar'),{state:'waiting',person:'o Evandro',nextAction:'assinar'});
 assert.deepEqual(continuationRequest('Já enviei; agora só falta a Maria conferir o documento'),{state:'waiting',person:'a Maria',nextAction:'conferir o documento'});
 assert.deepEqual(continuationRequest('Agora estou aguardando Evandro'),{state:'waiting',person:'Evandro',nextAction:null});
 assert.deepEqual(continuationRequest('Agora vou revisar o contrato'),{state:'pending',nextAction:'revisar o contrato'});
 assert.deepEqual(continuationRequest('Já assinou, pode concluir essa pendência'),{state:'completed',nextAction:null});
});
test('não trata conclusão de etapa como conclusão geral nem perde prazo ou outro pedido',()=>{
 for(const text of ['Já revisei','Feito','Pode concluir?','Não pode concluir','Talvez agora falta ele assinar','Agora vou revisar amanhã','Agora vou revisar e cobrar João','Vou comprar pão','Agora falta ele assinar, me avisa amanhã','Agora falta ele assinar às 10h'])assert.equal(continuationRequest(text),null,text);
});
