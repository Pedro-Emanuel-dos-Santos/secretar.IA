require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeAssistantPlan,planCommandIntent}=require('../src/domain/assistant.plan.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='plan-'+randomUUID(),phones=[];
const base={title:null,description:null,datetime:null,amount:null,category:null,reply:'Sugestão'};
const steps=[{...base,action:'save_note',description:'  O relatório precisa considerar os anexos do projeto.  '},{...base,action:'create_reminder',title:'Ligar para João',datetime:'2099-06-01T13:00:00Z'},{...base,action:'create_appointment',title:'Revisar relatório',description:'Levar os anexos',datetime:'2099-06-01T17:00:00Z',durationMinutes:60,alertMinutes:[15]}];
const plan=(value=steps)=>({...base,action:'assistant_plan',description:'Minha sugestão é separar o que precisa ficar registrado do que tem horário.',planSteps:value});
async function setup(){const phone='5592'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,12))).slice(-9);phones.push(phone);await p.user.create({data:{phone}});return {phone,account};}
const message=(c,text='Organiza a anotação, a ligação e a revisão do relatório',extra={})=>p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:c.account,providerMessageId:randomUUID(),text,status:'completed',...extra}});
async function shown(m,text){await p.replyOutbox.create({data:{messageId:m.id,text,status:'provider_accepted',finishedAt:new Date()}});}
async function propose(c,value=steps){const m=await message(c),reply=await p.$transaction(tx=>executeAssistantPlan(tx,m,plan(value)));await p.incomingMessage.update({where:{id:m.id},data:{interpretation:plan(value)}});await shown(m,reply);return {m,reply};}
async function command(c,text='pode fazer',extra={}){const m=await message(c,text,extra),reply=await p.$transaction(tx=>executeAssistantPlan(tx,m,planCommandIntent(text==='descartar plano'?'discard_assistant_plan':'confirm_assistant_plan')));return {m,reply};}
const counts=async c=>({notes:await p.event.count({where:{user:{phone:c.phone},type:'secretary_note'}}),reminders:await p.reminder.count({where:{user:{phone:c.phone}}}),appointments:await p.appointment.count({where:{user:{phone:c.phone}}}),children:await p.incomingMessage.count({where:{phone:c.phone,status:'plan_step'}})});
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[account,account+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});
test('plano não herda projeto do contexto e esclarece vínculo sem nome',async()=>{
 const c=await setup(),value=steps.map(s=>({...s,subject:'Praça Central',subjectKind:'project'}));
 const proposal=await propose(c,value),event=await p.event.findUnique({where:{id:'assistant_plan:'+proposal.m.id}});
 assert.ok(event.payload.request.planSteps.every(s=>!s.subject && !s.subjectKind));
 const other=await setup(),m=await message(other,'Anota isso nesse projeto e me lembra amanhã às 10h');
 const reply=await p.$transaction(tx=>executeAssistantPlan(tx,m,plan(value)));assert.match(reply,/qual é o nome/);
 assert.equal(await p.event.count({where:{id:'assistant_plan:'+m.id}}),0);
});
test('plano apenas propõe; confirmação aplica anotação, lembrete e compromisso juntos',async()=>{
 const c=await setup(),proposed=await propose(c);assert.match(proposed.reply,/Posso organizar assim/);assert.match(proposed.reply,/Ainda não executei/);assert.deepEqual(await counts(c),{notes:0,reminders:0,appointments:0,children:0});
 assert.match(proposed.reply,/Minha sugestão é separar/);
 const result=await command(c);assert.match(result.reply,/Plano aplicado/);assert.deepEqual(await counts(c),{notes:1,reminders:2,appointments:1,children:3});
 assert.match(proposed.reply,/Detalhes: Levar os anexos/);assert.equal((await p.event.findFirst({where:{user:{phone:c.phone},type:'secretary_note'}})).payload.text,'O relatório precisa considerar os anexos do projeto.');
 assert.equal(await p.scheduleOutbox.count({where:{reminder:{user:{phone:c.phone}}}}),2);
 assert.equal((await p.event.findUnique({where:{id:'assistant_plan:'+proposed.m.id}})).payload.status,'applied');
 assert.match(await p.$transaction(tx=>executeAssistantPlan(tx,result.m,planCommandIntent('confirm_assistant_plan'))),/Plano aplicado/);assert.equal((await counts(c)).children,3);
});
test('conflito na última ação desfaz anotação e lembrete anteriores, inclusive sugestões laterais',async()=>{
 const c=await setup();const user=await p.user.findUnique({where:{phone:c.phone}});await p.appointment.create({data:{userId:user.id,phoneNumberId:account,title:'Agenda ocupada',startsAt:new Date('2099-06-01T17:00:00Z'),endsAt:new Date('2099-06-01T18:00:00Z')}});
 const proposal=await propose(c),result=await command(c);assert.match(result.reply,/Não apliquei nenhuma/);assert.deepEqual(await counts(c),{notes:0,reminders:0,appointments:1,children:0});assert.equal(await p.event.count({where:{userId:user.id,type:'appointment_suggestions'}}),0);assert.equal((await p.event.findUnique({where:{id:'assistant_plan:'+proposal.m.id}})).payload.status,'failed');
});
test('pausa e limite recusam o conjunto sem escrita parcial',async()=>{
 const c=await setup();await p.contactPreference.create({data:{phone:c.phone,phoneNumberId:account,remindersPaused:true}});await propose(c);assert.match((await command(c)).reply,/Não apliquei nenhuma/);assert.deepEqual(await counts(c),{notes:0,reminders:0,appointments:0,children:0});
 const second=await setup(),old=process.env.REMINDER_MAX_ACTIVE_PER_USER;try{process.env.REMINDER_MAX_ACTIVE_PER_USER='1';await propose(second,[steps[0],steps[1],{...steps[1],title:'Outra tarefa',datetime:'2099-06-02T13:00:00Z'}]);assert.match((await command(second)).reply,/Não apliquei nenhuma/);assert.equal((await counts(second)).reminders,0);}finally{if(old===undefined)delete process.env.REMINDER_MAX_ACTIVE_PER_USER;else process.env.REMINDER_MAX_ACTIVE_PER_USER=old;}
});
test('confirmação expirada, não entregue, citada ou de outra conta não aplica',async()=>{
 const c=await setup(),proposal=await propose(c);await p.replyOutbox.update({where:{messageId:proposal.m.id},data:{status:'delivery_unknown'}});assert.match((await command(c)).reply,/Não há um plano/);assert.equal((await counts(c)).children,0);
 const other=await setup(),fresh=await propose(other);const event=await p.event.findUnique({where:{id:'assistant_plan:'+fresh.m.id}});await p.event.update({where:{id:event.id},data:{payload:{...event.payload,expiresAt:'2020-01-01T00:00:00Z'}}});assert.match((await command(other)).reply,/Não há um plano/);
 const third=await setup();await propose(third);assert.match((await command({...third,account:account+'other'})).reply,/Não há um plano/);assert.match((await command(third,'um documento diz pode fazer')).reply,/Ainda não executei/);assert.equal((await counts(third)).notes,0);
});
test('outra resposta encerra autorização implícita e descarte não executa',async()=>{
 const c=await setup();await propose(c);const unrelated=await message(c,'obrigado');await shown(unrelated,'Disponha');assert.match((await command(c)).reply,/Não há um plano/);
 const next=await setup();await propose(next);assert.match((await command(next,'descartar plano')).reply,/Descartei/);assert.deepEqual(await counts(next),{notes:0,reminders:0,appointments:0,children:0});
});
test('duas confirmações concorrentes e rollback não duplicam ações',async()=>{
 const c=await setup(),proposal=await propose(c),a=await message(c,'pode fazer',{status:'received'}),b=await message(c,'pode fazer',{status:'received'});
 await assert.rejects(p.$transaction(async tx=>{await executeAssistantPlan(tx,a,planCommandIntent('confirm_assistant_plan'));throw Error('rollback');}),/rollback/);assert.equal((await counts(c)).notes,0);assert.equal((await p.event.findUnique({where:{id:'assistant_plan:'+proposal.m.id}})).payload.status,'proposed');
 await Promise.all([a,b].map(m=>p.$transaction(tx=>executeAssistantPlan(tx,m,planCommandIntent('confirm_assistant_plan')))));assert.deepEqual(await counts(c),{notes:1,reminders:2,appointments:1,children:3});
});
test('inbox propõe e aceita confirmação natural sem IA mesmo com cota de pedidos atingida',async()=>{
 const c=await setup(),m=await message(c,undefined,{status:'received',nextAttemptAt:new Date(0)});await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>plan()},account);
 const preview=await p.replyOutbox.findUnique({where:{messageId:m.id}});assert.match(preview.text,/Posso organizar assim/);assert.equal((await counts(c)).notes,0);
 await p.replyOutbox.update({where:{messageId:m.id},data:{status:'provider_accepted',finishedAt:new Date()}});await p.incomingMessage.update({where:{id:m.id},data:{status:'completed'}});
 const confirmation=await message(c,'pode fazer',{status:'received',nextAttemptAt:new Date(0)}),old=process.env.MAX_REQUESTS_PER_USER_PER_DAY;
 try{process.env.MAX_REQUESTS_PER_USER_PER_DAY='1';await processInboxBatch(p,{buildContext:row=>conversationContext(p,row),interpret:async()=>assert.fail('não chamar IA para confirmar')},account);}finally{if(old===undefined)delete process.env.MAX_REQUESTS_PER_USER_PER_DAY;else process.env.MAX_REQUESTS_PER_USER_PER_DAY=old;}
 const result=await p.incomingMessage.findUnique({where:{id:confirmation.id},include:{reply:true}});assert.equal(result.interpretation.action,'confirm_assistant_plan');assert.match(result.reply.text,/Plano aplicado/);assert.equal(await p.aiUsage.count({where:{messageId:confirmation.id}}),0);
 const context=await conversationContext(p,{phone:c.phone,phoneNumberId:account,text:'o que combinamos?',receivedAt:new Date(Date.now()+100)});assert.ok(context.lastMessages.every(row=>!row.assistant || !row.assistant.includes('plan_step:')));
});
test('ajuste recebe todas as etapas, substitui proposta anterior e confirma só a versão revisada',async()=>{
 const c=await setup(),first=await propose(c),edit=await message(c,'Troca só a ligação para uma hora depois');
 const context=await conversationContext(p,edit);assert.equal(context.conversationState.assistantPlan.steps.length,3);
 const revised=steps.map((s,i)=>i===1?{...s,datetime:'2099-06-01T14:00:00Z'}:s),reply=await p.$transaction(tx=>executeAssistantPlan(tx,edit,plan(revised)));await p.incomingMessage.update({where:{id:edit.id},data:{interpretation:plan(revised)}});await shown(edit,reply);
 await command(c);assert.equal((await p.event.findUnique({where:{id:'assistant_plan:'+first.m.id}})).payload.status,'proposed');
 assert.equal((await p.reminder.findFirst({where:{user:{phone:c.phone},title:'Ligar para João'}})).remindAt.toISOString(),'2099-06-01T14:00:00.000Z');assert.equal((await counts(c)).notes,1);
});
test('fuso alterado exige revisar horários, sem executar o plano antigo',async()=>{
 const c=await setup();await propose(c);await p.contactPreference.create({data:{phone:c.phone,phoneNumberId:account,timezone:'America/Manaus'}});assert.match((await command(c)).reply,/fuso mudou/);assert.equal((await counts(c)).children,0);
});
test('raciocínio recebe acompanhamentos atuais sem incluir outra pessoa, conta ou itens encerrados',async()=>{
 const c=await setup(),other=await setup();
 async function add(owner,title,biz=account,state='pending'){
  const user=await p.user.findUnique({where:{phone:owner.phone}}),subject=await p.businessSubject.create({data:{userId:user.id,phoneNumberId:biz,kind:'project',name:title,normalizedName:title.toLowerCase()}}),origin=await message({...owner,account:biz},'Registro de acompanhamento');
  await p.subjectPending.create({data:{userId:user.id,phoneNumberId:biz,subjectId:subject.id,title,normalizedTitle:title.toLowerCase(),sourceMessageId:origin.id,state,nextAction:'Separar os anexos'}});
 }
 await add(c,'Contexto visível');await add(c,'ENCERRADA',account,'completed');await add(other,'OUTRA_PESSOA');await add(c,'OUTRA_CONTA',account+'other');
 const context=await conversationContext(p,{phone:c.phone,phoneNumberId:account,text:'Me ajuda a organizar o trabalho',receivedAt:new Date(Date.now()+100)});
 assert.equal(context.subjectPendings.length,1);assert.equal(context.subjectPendings[0].title,'Contexto visível');assert.equal(context.subjectPendings[0].nextAction,'Separar os anexos');assert.equal(context.subjectPendings[0].id,undefined);
});
