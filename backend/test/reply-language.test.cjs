require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spokenMoment,reminderQuestion,appointmentQuestion,alertOffset,counted}=require('../src/domain/reply.language.ts');
const {formatReminderReply,executeAction}=require('../src/domain/action.executor.ts');
test('hoje e amanhã usam dia local, não o dia UTC nem intervalos fixos de 24 horas',()=>{
 const reference=new Date('2026-10-22T01:00:00Z');assert.equal(spokenMoment(new Date('2026-10-22T02:30:00Z'),'America/Sao_Paulo',reference),'hoje às 23:30');assert.equal(spokenMoment(new Date('2026-10-22T12:30:00Z'),'America/Sao_Paulo',reference),'amanhã às 09:30');
 const beforeDST=new Date('2027-03-13T23:00:00-05:00');assert.equal(spokenMoment(new Date('2027-03-14T09:30:00-04:00'),'America/New_York',beforeDST),'amanhã às 09:30');
});
test('confirmação recalculada no envio não chama de amanhã um horário que já é hoje',()=>{
 const task={title:'Enviar proposta',remindAt:new Date('2026-10-22T12:30:00Z'),status:'scheduled'};
 assert.match(formatReminderReply(task,'America/Sao_Paulo',new Date('2026-10-21T15:00:00Z')),/amanhã às 09:30/);
 assert.match(formatReminderReply(task,'America/Sao_Paulo',new Date('2026-10-22T10:00:00Z')),/hoje às 09:30/);
 assert.match(spokenMoment(new Date('2099-06-02T12:30:00Z'),'America/Sao_Paulo',new Date('2026-10-21T15:00:00Z')),/02\/06\/2099/);
});
test('pergunta pede apenas a parte ausente e não repete o pedido inteiro',()=>{
 const reference=new Date('2026-10-21T15:00:00Z');const hour=reminderQuestion({date:'2026-10-22',time:null},'America/Sao_Paulo',reference);assert.equal(hour,'Que horas você quer que eu te lembre amanhã?');
 const day=reminderQuestion({date:null,time:'09:30'},'America/Sao_Paulo',reference);assert.equal(day,'Às 09:30. Em qual dia você quer esse lembrete?');
 assert.equal((hour.match(/\?/g)||[]).length,1);assert.equal((day.match(/\?/g)||[]).length,1);
});
test('compromisso com hora conhecida pergunta só o dia e aviso é descrito pela antecedência real',()=>{assert.equal(appointmentQuestion({date:null,time:'09:30'}),'Às 09:30. Em qual dia será o compromisso?');assert.equal(alertOffset(0),'na hora');assert.equal(alertOffset(1),'1 minuto antes');assert.equal(alertOffset(90),'1 hora e 30 minutos antes');assert.equal(alertOffset(1440),'24 horas antes');});
test('redação natural continua sem prometer agendamento não confirmado',()=>{
 const pending=formatReminderReply({title:'Enviar proposta',remindAt:new Date('2026-10-22T12:30:00Z'),status:'scheduling_pending'},'America/Sao_Paulo',new Date('2026-10-21T15:00:00Z'));
 assert.match(pending,/amanhã às 09:30/);assert.match(pending,/ainda não foi confirmado/);assert.doesNotMatch(pending,/eu te lembro|Combinado/);
 assert.equal(counted(1,'tarefa pendente','tarefas pendentes'),'1 tarefa pendente');assert.equal(counted(2,'tarefa pendente','tarefas pendentes'),'2 tarefas pendentes');
});
test('pergunta contextual não cria tarefa e confirmação usa registro persistido',async()=>{
 const reference=new Date('2026-10-21T15:00:00Z');const base={action:'create_reminder',title:'Enviar proposta',reply:'Mensagem inventada',datetime:null,draft:{date:'2026-10-22',time:null}};
 const missing=await executeAction('5551999999999',base,()=>assert.fail(),undefined,undefined,undefined,'America/Sao_Paulo',reference);assert.match(missing,/Que horas.*amanhã/);assert.doesNotMatch(missing,/Mensagem inventada/);
 const confirmed=await executeAction('5551999999999',{...base,datetime:'2099-06-02T12:30:00Z'},async()=>({title:'Título realmente salvo',remindAt:new Date('2026-10-22T12:30:00Z'),status:'scheduled'}),undefined,undefined,undefined,'America/Sao_Paulo',reference);assert.match(confirmed,/Título realmente salvo/);assert.match(confirmed,/amanhã às 09:30/);assert.doesNotMatch(confirmed,/Mensagem inventada/);
});
