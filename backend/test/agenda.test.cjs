require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {agendaRange}=require('../src/domain/agenda.overview.ts');
const {localCommand}=require('../src/domain/local.commands.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
test('semana usa segunda a domingo no fuso local, inclusive perto da virada UTC',()=>{
 for(const now of ['2026-10-21T15:00:00Z','2026-10-26T01:00:00Z']){const r=agendaRange('week',new Date(now),'America/Sao_Paulo');assert.equal(r.start.toISOString(),'2026-10-19T03:00:00.000Z');assert.equal(r.end.toISOString(),'2026-10-26T03:00:00.000Z');}
});
test('próxima semana e próximos sete dias têm intervalos distintos e fim exclusivo',()=>{
 const now=new Date('2026-10-21T15:00:00Z'),next=agendaRange('next_week',now,'America/Sao_Paulo'),seven=agendaRange('next_7_days',now,'America/Sao_Paulo');assert.equal(next.start.toISOString(),'2026-10-26T03:00:00.000Z');assert.equal(next.end.toISOString(),'2026-11-02T03:00:00.000Z');assert.equal(seven.start.toISOString(),'2026-10-21T03:00:00.000Z');assert.equal(seven.end.toISOString(),'2026-10-28T03:00:00.000Z');
});
test('limites seguem calendário e não presumem semanas com 168 horas em horário de verão',()=>{
 const spring=agendaRange('week',new Date('2026-03-04T15:00:00Z'),'America/New_York'),fall=agendaRange('week',new Date('2026-10-28T15:00:00Z'),'America/New_York');assert.equal((spring.end-spring.start)/3600000,167);assert.equal((fall.end-fall.start)/3600000,169);
 const tomorrow=agendaRange('tomorrow',new Date('2026-10-21T03:00:00Z'),'America/Rio_Branco');assert.equal(tomorrow.start.toISOString(),'2026-10-21T05:00:00.000Z');assert.equal(tomorrow.end.toISOString(),'2026-10-22T05:00:00.000Z');
});
test('consultas locais reconhecem somente pedidos de leitura completos',()=>{
 for(const [text,command] of [['Como está minha semana?','week'],['Próxima semana','next_week'],['Resumo de amanhã','tomorrow'],['Próximos 7 dias','next_7_days']])assert.equal(localCommand(text),command);
 for(const text of ['Cancela minha semana','Minha semana e cancela tudo','Resumo da próxima semana da Ana'])assert.equal(localCommand(text),null);
});
test('contrato da agenda valida períodos sem aceitar intervalo inventado',()=>{assert.equal(parseInterpretation(JSON.stringify({action:'agenda_overview',agendaPeriod:'next_week',reply:'interno'})).agendaPeriod,'next_week');assert.throws(()=>parseInterpretation(JSON.stringify({action:'agenda_overview',agendaPeriod:'all_private',reply:'interno'})));});
test('agenda sem período ou com filtro não suportado pergunta em vez de devolver consulta diferente',async()=>{const {executeAction}=require('../src/domain/action.executor.ts');for(const extra of [{},{agendaPeriod:'week',subject:'Ana'},{agendaPeriod:'week',taskFilter:'waiting'}]){const reply=await executeAction('test',{action:'agenda_overview',reply:'interno',...extra},()=>assert.fail(),undefined,undefined,()=>assert.fail());assert.ok(reply.includes('?'));}});
