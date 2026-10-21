require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ordinalIndex,applyTaskSelection}=require('../src/domain/task.selection.ts');
const list={id:'list',items:[{id:'a',version:2,title:'Primeira'},{id:'b',version:4,title:'Segunda'}]};
test('ordinais não confundem duração relativa ou dia da semana com item',()=>{
 for(const s of ['me lembra daqui a 1 minuto','daqui a dois segundos','muda para a quarta','agenda para a segunda','daqui a 10 minutos'])assert.equal(ordinalIndex(s),null,s);
 for(const [s,n] of [['conclui o segundo',1],['cancela a primeira',0],['reagenda o item 2',1],['conclua o 2º',1],['item 10',9]])assert.equal(ordinalIndex(s),n,s);
 assert.equal(ordinalIndex('conclui o primeiro e o segundo'),-1);
});
test('seleção usa lista apresentada e sobrescreve identificador inventado',()=>{
 const i={action:'complete_reminder',reply:'interno',reminderId:'inventado',search:'errado',expectedVersion:99};applyTaskSelection(i,'conclui o segundo',list);
 assert.equal(i.reminderId,'b');assert.equal(i.expectedVersion,4);assert.equal(i.selectionListId,'list');assert.equal(i.selectionIndex,1);assert.equal(i.search,null);
});
test('referência sem lista, fora do limite, negativa ou coletiva não altera tarefas',()=>{
 for(const [text,snapshot] of [['conclui o segundo',null],['conclui o terceiro',list],['não conclui o segundo',list],['conclui o primeiro e o segundo',list],['o segundo',list]]){const i={action:'complete_reminder',reply:'interno'};applyTaskSelection(i,text,snapshot);assert.equal(i.action,'conversation',text);assert.equal(i.selectionListId,undefined);}
});
test('modelo não fornece seleção interna sem ordinal explícito',()=>{const i={action:'complete_reminder',selectionListId:'fake',selectionIndex:0};applyTaskSelection(i,'conclui comprar pão',list);assert.equal(i.selectionListId,undefined);assert.equal(i.selectionIndex,undefined);});
test('primeira parcela em uma nova tarefa não é seleção de item da lista',()=>{const i={action:'create_reminder',title:'Pagar primeira parcela',datetime:'2099-01-01T12:00:00Z'};applyTaskSelection(i,'Me lembra de pagar a primeira parcela amanhã',null);assert.equal(i.action,'create_reminder');assert.equal(i.title,'Pagar primeira parcela');});
