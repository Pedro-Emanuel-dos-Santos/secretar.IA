require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {agendaRange}=require('../src/domain/agenda.overview.ts');
const {localCommand}=require('../src/domain/local.commands.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {agendaOverview}=require('../src/domain/agenda.overview.ts');
test('depois de amanhã segue calendário local inclusive virada UTC, mês e mudança de offset',()=>{
 for(const [now,zone,start,end] of [
  ['2026-10-22T02:30:00Z','America/Sao_Paulo','2026-10-23T03:00:00.000Z','2026-10-24T03:00:00.000Z'],
  ['2028-02-28T15:00:00Z','America/Sao_Paulo','2028-03-01T03:00:00.000Z','2028-03-02T03:00:00.000Z'],
  ['2026-03-06T15:00:00Z','America/New_York','2026-03-08T05:00:00.000Z','2026-03-09T04:00:00.000Z']]){
  const range=agendaRange('day_after_tomorrow',new Date(now),zone);assert.equal(range.start.toISOString(),start);assert.equal(range.end.toISOString(),end);
 }
 assert.equal(localCommand('O que tenho depois de amanhã?'),'day_after_tomorrow');
 for(const text of ['Cancela depois de amanhã','O que tenho depois de amanhã com Ana?','O que tenho amanhã e depois de amanhã?'])assert.equal(localCommand(text),null);
 assert.equal(parseInterpretation(JSON.stringify({action:'agenda_overview',agendaPeriod:'day_after_tomorrow',reply:'interno'})).agendaPeriod,'day_after_tomorrow');
});
function presentationStore(){
 const task={id:'task',title:'Mandar orçamento para Ana Souza',subject:{name:'Ana Souza'},remindAt:new Date('2026-10-22T04:15:00Z'),status:'scheduled'};
 return {contactPreference:{findUnique:async()=>({timezone:'America/Sao_Paulo'})},
  reminder:{findMany:async({where})=>where.taskProgress==='waiting'?[]:[task],count:async({where})=>where.taskProgress==='waiting'||where.remindAt?.lt&&!where.remindAt?.gte?0:1},
  appointment:{findMany:async()=>[],count:async()=>0}};
}
test('agenda de amanhã usa uma data local e cada item mostra só a hora sem duplicar nome',async()=>{
 const reply=await agendaOverview('phone','biz',presentationStore(),'tomorrow',new Date('2026-10-22T02:30:00Z'));
 assert.match(reply,/Amanhã, 22\/10\/2026/);assert.equal((reply.match(/22\/10\/2026/g)||[]).length,1);
 assert.match(reply,/• 01:15 — Aviso de tarefa: Mandar orçamento para Ana Souza/);
 assert.equal((reply.match(/Ana Souza/g)||[]).length,1);assert.match(reply,/1 tarefa pendente/);
});
test('agenda semanal mantém dia de cada item e limites de segunda a domingo',async()=>{
 const reply=await agendaOverview('phone','biz',presentationStore(),'week',new Date('2026-10-22T15:00:00Z'));
 assert.match(reply,/19\/10\/2026 a 25\/10\/2026/);assert.match(reply,/22\/10, 01:15/);
});
test('período vazio não esconde espera, pendências anteriores ou pausa',async()=>{
 const store=presentationStore();
 store.reminder.findMany=async({where})=>where.taskProgress==='waiting'?[{id:'waiting',title:'Retorno da gráfica',waitingFor:'aprovação'}]:[];
 store.reminder.count=async({where})=>where.taskProgress==='waiting'||where.remindAt?.lt&&!where.remindAt?.gte?1:0;
 store.contactPreference.findUnique=async()=>({timezone:'America/Sao_Paulo',remindersPaused:true});
 const reply=await agendaOverview('phone','biz',store,'tomorrow',new Date('2026-10-22T02:30:00Z'));
 assert.match(reply,/Não há compromissos registrados nem avisos de tarefas pendentes nesse período/);
 assert.match(reply,/1 tarefa aguardando resposta, incluindo avisos fora do período/);assert.match(reply,/Retorno da gráfica/);
 assert.match(reply,/1 tarefa pendente com aviso anterior/);assert.match(reply,/avisos estão pausados/);
 assert.doesNotMatch(reply,/0 compromissos|0 tarefas/);
});
test('intervalo personalizado conserva horas e fim exclusivo mesmo dentro do mesmo dia',async()=>{
 const reply=await agendaOverview('phone','biz',presentationStore(),'week',new Date('2026-10-22T15:00:00Z'),{rangeStart:'2026-10-22T01:00:00-03:00',rangeEnd:'2026-10-22T02:00:00-03:00'});
 assert.match(reply,/22\/10\/2026, 01:00 até 22\/10\/2026, 02:00 \(fim exclusivo\)/);assert.match(reply,/• 01:15/);
});
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
test('agenda sem período ou com filtros conflitantes pergunta em vez de devolver consulta diferente',async()=>{const {executeAction}=require('../src/domain/action.executor.ts');for(const extra of [{},{agendaPeriod:'week',rangeStart:'2099-01-01T00:00:00Z'},{agendaPeriod:'week',taskFilter:'waiting'}]){const reply=await executeAction('test',{action:'agenda_overview',reply:'interno',...extra},()=>assert.fail(),undefined,undefined,()=>assert.fail());assert.ok(reply.includes('?'));}});
