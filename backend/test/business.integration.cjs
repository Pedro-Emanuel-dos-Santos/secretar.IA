require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const {executeFact}=require('../src/domain/business.memory.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {dayOverview}=require('../src/domain/day.overview.ts');
const {executeNote}=require('../src/domain/notes.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const biz='business-'+randomUUID(),phone='5584'+String(Date.now()).slice(-9),other='5583'+String(Date.now()).slice(-9);
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const incoming=async(text='teste',owner=phone,business=biz)=>p.incomingMessage.create({data:{phone:owner,phoneNumberId:business,providerMessageId:randomUUID(),text,status:'completed'}});
const call=async(action,fields={},owner=phone,business=biz)=>{const row=await incoming('teste',owner,business);return p.$transaction(tx=>executeAppointment(owner,business,intent(action,fields),tx,row.id));};
const fact=async(action,fields={},owner=phone,business=biz)=>{const row=await incoming('fato',owner,business);return p.$transaction(tx=>executeFact(owner,business,intent(action,fields),tx,row.id));};
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,other]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'-other']}}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});
let id;
test('evento às dez mantém horário com avisos separados e idempotência por mensagem',async()=>{
 const row=await incoming('Reunião amanhã às dez, avisar meia hora antes e na hora');
 const data=intent('create_appointment',{title:'Reunião João',datetime:'2099-05-02T10:00:00-03:00',alertMinutes:[30,0]});
 await p.$transaction(tx=>executeAppointment(phone,biz,data,tx,row.id));
 await p.$transaction(tx=>executeAppointment(phone,biz,data,tx,row.id));
 const events=await p.appointment.findMany({where:{phoneNumberId:biz},include:{reminders:true}});assert.equal(events.length,1);id=events[0].id;
 assert.equal(events[0].startsAt.toISOString(),'2099-05-02T13:00:00.000Z');assert.equal(events[0].reminders.length,2);
 assert.deepEqual(events[0].reminders.map(r=>r.remindAt.toISOString()).sort(),['2099-05-02T12:30:00.000Z','2099-05-02T13:00:00.000Z']);
 assert.equal(await p.scheduleOutbox.count({where:{reminder:{appointmentId:id},status:'pending'}}),2);
});
test('trocar apenas aviso preserva evento e reagendar evento preserva intervalos',async()=>{
 await call('set_appointment_alerts',{appointmentId:id,alertMinutes:[10,0]});
 assert.equal((await p.appointment.findUniqueOrThrow({where:{id}})).startsAt.toISOString(),'2099-05-02T13:00:00.000Z');
 await call('reschedule_appointment',{appointmentId:id,datetime:'2099-05-02T11:00:00-03:00'});
 const alerts=await p.reminder.findMany({where:{appointmentId:id,state:'active'},orderBy:{remindAt:'asc'}});
 assert.deepEqual(alerts.map(r=>r.remindAt.toISOString()),['2099-05-02T13:50:00.000Z','2099-05-02T14:00:00.000Z']);
 const old=await p.reminder.findMany({where:{appointmentId:id,state:'cancelled'},include:{scheduleOutbox:true}});assert.equal(old.length,4);assert.ok(old.every(r=>r.scheduleOutbox.status==='cancelled'&&r.scheduleVersion===1));
 const reply=await p.$transaction(tx=>manageReminders(phone,biz,intent('reschedule_reminder',{reminderId:alerts[0].id,datetime:'2099-05-02T12:00:00-03:00'}),tx));assert.match(reply,/pertence a um compromisso/);
});
test('falha na criação de um dos avisos reverte evento e demais avisos',async()=>{
 const before=await p.appointment.count({where:{phoneNumberId:biz}}),row=await incoming();
 await assert.rejects(p.$transaction(tx=>{let created=0;const proxy=new Proxy(tx,{get(target,key){if(key==='reminder')return new Proxy(target.reminder,{get(model,method){if(method==='create')return args=>{if(++created===2)throw Error('falha simulada');return model.create(args);};return model[method];}});return target[key];}});return executeAppointment(phone,biz,intent('create_appointment',{title:'Reverter',datetime:'2099-06-01T10:00:00-03:00',alertMinutes:[30,0]}),proxy,row.id);}),/falha simulada/);
 assert.equal(await p.appointment.count({where:{phoneNumberId:biz}}),before);
});
test('aviso no passado e limite não cancelam avisos existentes',async()=>{
 const before=await p.reminder.count({where:{appointmentId:id,state:'active'}});
 const oldLimit=process.env.REMINDER_MAX_CREATED_PER_DAY;process.env.REMINDER_MAX_CREATED_PER_DAY='1';
 try{assert.match(await call('set_appointment_alerts',{appointmentId:id,alertMinutes:[20]}),/limite/);}finally{if(oldLimit===undefined)delete process.env.REMINDER_MAX_CREATED_PER_DAY;else process.env.REMINDER_MAX_CREATED_PER_DAY=oldLimit;}
 assert.equal(await p.reminder.count({where:{appointmentId:id,state:'active'}}),before);
 assert.match(await call('create_appointment',{title:'Passado',datetime:new Date(Date.now()+60000).toISOString(),alertMinutes:[30]}),/passado/);
 assert.equal(await p.appointment.count({where:{phoneNumberId:biz,title:'Passado'}}),0);
});
test('pausa, conta alheia e envio incerto impedem alteração de compromisso',async()=>{
 assert.match(await call('cancel_appointment',{appointmentId:id},other),/Não encontrei/);
 assert.match(await call('cancel_appointment',{appointmentId:id},phone,biz+'-other'),/Não encontrei/);
 await p.contactPreference.create({data:{phoneNumberId:biz,phone,remindersPaused:true}});
 assert.match(await call('set_appointment_alerts',{appointmentId:id,alertMinutes:[5]}),/pausados/);
 await p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}},data:{remindersPaused:false}});
 const alert=await p.reminder.findFirstOrThrow({where:{appointmentId:id,state:'active'}});await p.reminder.update({where:{id:alert.id},data:{status:'delivery_unknown'}});
 assert.match(await call('cancel_appointment',{appointmentId:id}),/entrou em envio/);
 assert.equal((await p.appointment.findUniqueOrThrow({where:{id}})).state,'active');
 await p.reminder.update({where:{id:alert.id},data:{status:'scheduled'}});
});
test('cancelamento do compromisso cancela todos os avisos pendentes',async()=>{
 assert.match(await call('cancel_appointment',{appointmentId:id}),/Cancelei/);
 assert.equal(await p.reminder.count({where:{appointmentId:id,state:'active'}}),0);
 assert.equal(await p.scheduleOutbox.count({where:{reminder:{appointmentId:id},status:'pending'}}),0);
});
test('MEU DIA mostra horário do evento sem duplicar seus avisos como tarefas',async()=>{
 const row=await incoming();await p.$transaction(tx=>executeAppointment(phone,biz,intent('create_appointment',{title:'Agenda do dia',datetime:'2099-05-03T10:00:00-03:00',alertMinutes:[30,0]}),tx,row.id));
 const summary=await p.$transaction(tx=>dayOverview(phone,biz,tx,new Date('2099-05-03T12:00:00Z')));
 assert.match(summary,/1 compromisso\(s\)/);assert.match(summary,/10:00 — Agenda do dia/);assert.doesNotMatch(summary,/09:30/);assert.match(summary,/Nenhuma tarefa pendente/);
 const created=await p.appointment.findUniqueOrThrow({where:{sourceMessageId:row.id}});await call('cancel_appointment',{appointmentId:created.id});
});
test('orçamento atual substitui o anterior com histórico por cliente e conta',async()=>{
 await fact('save_fact',{subject:'João Silva',factKey:'orçamento',factValue:'R$ 500'});
 await fact('save_fact',{subject:'João Silva',factKey:'valor_orcamento',factValue:'R$ 650'});
 const current=await fact('search_facts',{subject:'joao silva',factKey:'orcamento'});assert.match(current,/650/);assert.doesNotMatch(current,/500/);
 const history=await fact('search_facts',{subject:'João Silva',factKey:'orcamento',includeHistory:true});assert.match(history,/500 \(anterior\)/);assert.match(history,/650 \(atual\)/);
 assert.match(await fact('search_facts',{subject:'João Silva'},other),/Não encontrei/);assert.match(await fact('search_facts',{subject:'João Silva'},phone,biz+'-other'),/Não encontrei/);
 await fact('save_fact',{subject:'João Souza',factKey:'prazo',factValue:'sexta'});
 assert.match(await fact('save_fact',{subject:'João',factKey:'orcamento',factValue:'900'}),/nome completo/);
 assert.equal(await p.businessSubject.count({where:{phoneNumberId:biz,name:'João'}}),0);
});
test('fato repetido por mesma mensagem não cria revisão; origem alheia falha',async()=>{
 const row=await incoming(),data=intent('save_fact',{subject:'Projeto Alfa',subjectKind:'project',factKey:'status',factValue:'Em andamento'});
 await p.$transaction(tx=>executeFact(phone,biz,data,tx,row.id));await p.$transaction(tx=>executeFact(phone,biz,data,tx,row.id));
 assert.equal(await p.knowledgeFact.count({where:{sourceMessageId:row.id}}),1);
 await assert.rejects(p.$transaction(tx=>executeFact(other,biz,data,tx,row.id)),/Origem/);
 const c=await conversationContext(p,{phone,phoneNumberId:biz,text:'qual valor?',receivedAt:new Date()});assert.ok(c.subjects.some(s=>s.name==='João Silva'&&s.facts.some(f=>f.value==='R$ 650')));
});
test('busca de cadastro ausente consulta notas antigas sem atravessar contas',async()=>{
 await p.$transaction(tx=>executeNote(phone,biz,intent('save_note',{description:'Cliente Maria Oliveira: orçamento R$ 700 e entrega sexta.'}),tx));
 const reply=await fact('search_facts',{subject:'Maria Oliveira',factKey:'orcamento'});assert.match(reply,/700/);assert.match(reply,/anotações/);
 assert.match(await fact('search_facts',{subject:'Maria Oliveira'},phone,biz+'-other'),/Não encontrei/);
});
test('fluxo inbox persiste compromisso e resposta juntos sem envio real',async()=>{
 const row=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Reunião às dez dia dois de maio de 2099',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>intent('create_appointment',{title:'Fluxo completo',datetime:'2099-05-02T10:00:00-03:00',alertMinutes:[30]})},biz);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true,appointment:true}});assert.ok(saved.appointment);assert.match(saved.reply.text,/10:00/);assert.match(saved.reply.text,/09:30/);
 const c=await conversationContext(p,{phone,phoneNumberId:biz,text:'me avisa antes',receivedAt:new Date(Date.now()+1000)});assert.equal(c.conversationState.focusedAppointment.id,saved.appointment.id);
});
