require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ordinalIndex,applyTaskSelection}=require('../src/domain/task.selection.ts');
const {listPosition}=require('../src/domain/task.selection.ts');
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
 for(const [text,snapshot] of [['conclui o segundo',null],['conclui o terceiro',list],['não conclui o segundo',list],['conclui o primeiro e o segundo',list]]){const i={action:'complete_reminder',reply:'interno'};applyTaskSelection(i,text,snapshot);assert.equal(i.action,'conversation',text);assert.equal(i.selectionListId,undefined);}
});
test('modelo não fornece seleção interna sem ordinal explícito',()=>{const i={action:'complete_reminder',selectionListId:'fake',selectionIndex:0};applyTaskSelection(i,'conclui comprar pão',list);assert.equal(i.selectionListId,undefined);assert.equal(i.selectionIndex,undefined);});
test('primeira parcela em uma nova tarefa não é seleção de item da lista',()=>{const i={action:'create_reminder',title:'Pagar primeira parcela',datetime:'2099-01-01T12:00:00Z'};applyTaskSelection(i,'Me lembra de pagar a primeira parcela amanhã',null);assert.equal(i.action,'create_reminder');assert.equal(i.title,'Pagar primeira parcela');});
test('ordinal sem ação seleciona sem concluir e confirmação curta usa referência confiável',()=>{
 const i={action:'conversation',reply:'interno'};applyTaskSelection(i,'o segundo',list);assert.equal(i.action,'select_task');assert.equal(i.reminderId,'b');
 const follow={action:'complete_reminder',reminderId:'inventado'};applyTaskSelection(follow,'pode concluir',null,{id:'focus',list,index:1});assert.equal(follow.reminderId,'b');assert.equal(follow.selectionFocusId,'focus');
 const missing={action:'complete_reminder',reminderId:'inventado'};applyTaskSelection(missing,'pode concluir',null);assert.equal(missing.action,'conversation');
});
test('sim sozinho e pedido negado não autorizam alteração da tarefa selecionada',()=>{for(const text of ['sim','pode','não conclui','talvez cancela']){const i={action:'complete_reminder',reminderId:'a'};applyTaskSelection(i,text,null,{id:'focus',list,index:1});assert.equal(i.action,'conversation',text);assert.equal(i.reminderId,null);}});

test('último e penúltimo são posições da lista mostrada, sem inferir ordem de criação',()=>{
 for(const [text,index] of [['conclui o último',1],['a última tarefa da lista',1],['o penúltimo',0],['adia o último para amanhã',1]])assert.equal(listPosition(text,2),index,text);
 for(const text of ['cancela o último que criei','o último cadastrado','a última reunião','última semana'])assert.equal(listPosition(text,2),null,text);
 assert.equal(listPosition('conclui o primeiro e o último',2),-1);
 const i={action:'conversation'};applyTaskSelection(i,'a última tarefa da lista',list);assert.equal(i.action,'select_task');assert.equal(i.reminderId,'b');
 const cancel={action:'cancel_reminder',reminderId:'wrong'};applyTaskSelection(cancel,'cancela o penúltimo',list);assert.equal(cancel.reminderId,'a');assert.equal(cancel.selectionIndex,0);
});
test('último sem lista ou penúltimo de lista unitária pede nova referência',()=>{
 for(const [text,value] of [['cancela o último',null],['conclui o penúltimo',{...list,items:[list.items[0]]}]]){
  const r={action:'cancel_reminder'};applyTaskSelection(r,text,value);assert.equal(r.action,'conversation');assert.equal(r.reminderId,null);
 }
});
