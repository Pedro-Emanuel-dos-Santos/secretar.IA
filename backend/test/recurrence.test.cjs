require('./register.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict');
const {recurrenceDates}=require('../src/domain/recurrence.ts');
const {executeAction}=require('../src/domain/action.executor.ts');
test('diária e semanal preservam relógio de Brasília sem depender do fuso do servidor',()=>{
 assert.deepEqual(recurrenceDates('2099-12-31T09:00:00-03:00',{frequency:'daily',count:3}).map(d=>d.toISOString()),
 ['2099-12-31T12:00:00.000Z','2100-01-01T12:00:00.000Z','2100-01-02T12:00:00.000Z']);
 assert.equal(recurrenceDates('2099-12-31T09:00:00-03:00',{frequency:'weekly',count:2})[1].toISOString(),'2100-01-07T12:00:00.000Z');
});
test('mensal pula mês sem dia 31 e respeita ano bissexto sem deriva',()=>{
 assert.deepEqual(recurrenceDates('2099-01-31T09:00:00-03:00',{frequency:'monthly',count:3}).map(d=>d.toISOString().slice(0,10)),['2099-01-31','2099-03-31','2099-05-31']);
 assert.equal(recurrenceDates('2096-01-29T09:00:00-03:00',{frequency:'monthly',count:2})[1].toISOString().slice(0,10),'2096-02-29');
});
test('quantidade ilimitada ou inválida não gera ocorrências',()=>{
 for(const count of [null,0,1,13,2.5,Infinity]) assert.throws(()=>recurrenceDates('2099-01-01T09:00:00-03:00',{frequency:'daily',count}));
});
test('sem quantidade pergunta antes de persistir série',async()=>{
 const intent={action:'create_reminder',title:'revisar orçamentos',datetime:'2099-01-01T09:00:00-03:00',recurrence:{frequency:'weekly',count:null}};
 assert.match(await executeAction('5511999990000',intent,()=>assert.fail()),/Quantos avisos/);
});
