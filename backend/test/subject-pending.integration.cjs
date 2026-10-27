require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeSubjectPending}=require('../src/domain/subject.pending.ts');
const {subjectOverview}=require('../src/domain/subject.overview.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='pending-'+randomUUID(),phones=[];
const intent=(action,extra={})=>({action,reply:'interno',title:null,description:null,datetime:null,amount:null,category:null,...extra});
async function setup(account=biz){const phone='5577'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);const u=await p.user.create({data:{phone}});const subject=await p.businessSubject.create({data:{userId:u.id,phoneNumberId:account,kind:'project',name:'Avenida Beira Rio',normalizedName:'avenida beira rio'}});return {phone,subject,account};}
const source=(ctx,text='Registra a pendência Assinatura do contrato no projeto Avenida Beira Rio')=>p.incomingMessage.create({data:{phone:ctx.phone,phoneNumberId:ctx.account,providerMessageId:randomUUID(),text,status:'completed'}});
async function call(ctx,action,extra={},text){const m=await source(ctx,text);return {m,reply:await p.$transaction(tx=>executeSubjectPending(ctx.phone,ctx.account,intent(action,{subject:ctx.subject.name,subjectKind:'project',...extra}),tx,m.id))};}
const create=ctx=>call(ctx,'create_subject_pending',{title:'Assinatura do contrato',waitingFor:'Evandro',pendingState:'waiting',nextAction:'Cobrar retorno sobre a assinatura'},'Registra a pendência Assinatura do contrato no projeto Avenida Beira Rio, aguardando Evandro; próxima ação: cobrar retorno sobre a assinatura');
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});

test('pendência sem prazo persiste origem, próxima ação e resumo sem criar lembrete',async()=>{
 const ctx=await setup(),{m,reply}=await create(ctx);assert.match(reply,/Sem prazo definido e sem aviso/);
 const row=await p.subjectPending.findUnique({where:{sourceMessageId:m.id}});assert.equal(row.nextAction,'Cobrar retorno sobre a assinatura');assert.equal(row.state,'waiting');assert.equal(row.waitingFor,'Evandro');
 assert.equal(await p.reminder.count({where:{user:{phone:ctx.phone}}}),0);assert.equal(await p.scheduleOutbox.count({where:{reminder:{user:{phone:ctx.phone}}}}),0);
 const overview=await p.$transaction(tx=>subjectOverview(ctx.phone,ctx.account,intent('subject_overview',{subject:ctx.subject.name,subjectKind:'project'}),tx));assert.match(overview,/Pendências sem aviso/);assert.match(overview,/aguardando Evandro/);assert.match(overview,/Próxima ação: Cobrar retorno/);
 const list=await call(ctx,'list_subject_pendings');assert.match(list.reply,/Assinatura do contrato/);
});
test('repetição e criação concorrente não duplicam pendência aberta',async()=>{
 const ctx=await setup(),m=await source(ctx),i=intent('create_subject_pending',{subject:ctx.subject.name,subjectKind:'project',title:'Assinatura do contrato'});
 await p.$transaction(tx=>executeSubjectPending(ctx.phone,ctx.account,i,tx,m.id));await p.$transaction(tx=>executeSubjectPending(ctx.phone,ctx.account,i,tx,m.id));
 await Promise.all([create(ctx),create(ctx)]);assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),1);
 const second=await setup();await Promise.all([create(second),create(second)]);assert.equal(await p.subjectPending.count({where:{user:{phone:second.phone}}}),1);
});
test('atualização versiona e audita; concluir remove das abertas sem apagar histórico',async()=>{
 const ctx=await setup();await create(ctx);
 const fields={search:'Assinatura do contrato',nextAction:'Solicitar posição a Evandro',pendingState:'waiting',waitingFor:'Evandro'};
 const changed=await call(ctx,'update_subject_pending',fields,'Atualiza a próxima ação da pendência Assinatura do contrato do projeto Avenida Beira Rio: solicitar posição a Evandro, continuamos aguardando');assert.match(changed.reply,/Atualizei/);
 await p.$transaction(tx=>executeSubjectPending(ctx.phone,ctx.account,intent('update_subject_pending',{subject:ctx.subject.name,subjectKind:'project',...fields}),tx,changed.m.id));
 let row=await p.subjectPending.findFirst({where:{user:{phone:ctx.phone}}});assert.equal(row.version,1);
 await call(ctx,'update_subject_pending',{search:row.title,pendingState:'completed'},'Conclui a pendência Assinatura do contrato do projeto Avenida Beira Rio');
 row=await p.subjectPending.findUnique({where:{id:row.id}});assert.equal(row.state,'completed');assert.equal(row.version,2);assert.equal(row.waitingFor,null);assert.equal(row.nextAction,null);
 assert.match((await call(ctx,'list_subject_pendings')).reply,/Não encontrei/);assert.match((await call(ctx,'list_subject_pendings',{pendingState:'completed'})).reply,/concluída/);
 assert.equal(await p.event.count({where:{user:{phone:ctx.phone},type:'subject_pending_updated'}}),2);
});
test('origem e consultas não atravessam contato ou conta',async()=>{
 const ctx=await setup(),other=await setup(),{m}=await create(ctx);
 await assert.rejects(p.$transaction(tx=>executeSubjectPending(other.phone,ctx.account,intent('create_subject_pending',{subject:ctx.subject.name,title:'Intrusão'}),tx,m.id)),/Origem/);
 assert.match((await call(other,'list_subject_pendings')).reply,/Não encontrei/);
 const otherAccount={...ctx,account:biz+'other'};assert.match((await call(otherAccount,'list_subject_pendings')).reply,/Não encontrei/);
 assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),1);
});
test('pergunta, negação, prazo e atualização composta não criam nem concluem silenciosamente',async()=>{
 const ctx=await setup();
 for(const text of ['Não registra pendência no projeto Avenida Beira Rio','Registra uma pendência no projeto Avenida Beira Rio?','Preciso cobrar amanhã no projeto Avenida Beira Rio','Me avisa sobre o contrato do projeto Avenida Beira Rio'])await call(ctx,'create_subject_pending',{title:'Contrato'},text);
 await call(ctx,'create_subject_pending',{title:'Contrato',factKey:'status',factValue:'Assinado'});assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),0);
 await create(ctx);await call(ctx,'update_subject_pending',{search:'Assinatura do contrato',pendingState:'completed'},'Atualiza o projeto Avenida Beira Rio');
 assert.equal((await p.subjectPending.findFirst({where:{user:{phone:ctx.phone}}})).state,'waiting');
});
test('falha na transação desfaz pendência e auditoria juntas',async()=>{
 const ctx=await setup(),m=await source(ctx);
 await assert.rejects(p.$transaction(async tx=>{await executeSubjectPending(ctx.phone,ctx.account,intent('create_subject_pending',{subject:ctx.subject.name,subjectKind:'project',title:'Contrato'}),tx,m.id);throw Error('rollback');}),/rollback/);
 assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),0);assert.equal(await p.event.count({where:{user:{phone:ctx.phone},type:'subject_pending_created'}}),0);
});
test('não inventa interlocutor nem retira espera numa simples mudança de próxima ação',async()=>{
 const ctx=await setup();await call(ctx,'create_subject_pending',{title:'Contrato',waitingFor:'Pessoa inventada',pendingState:'waiting'},'Registra pendência de contrato do projeto Avenida Beira Rio');
 assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),0);await create(ctx);
 await call(ctx,'update_subject_pending',{search:'Assinatura do contrato',pendingState:'pending',nextAction:'Consultar posição'},'Atualiza a próxima ação da pendência Assinatura do contrato do projeto Avenida Beira Rio');
 const row=await p.subjectPending.findFirst({where:{user:{phone:ctx.phone}}});assert.equal(row.state,'waiting');assert.equal(row.version,0);assert.equal(row.waitingFor,'Evandro');
});
test('duas pendências legadas com o mesmo título não permitem escolher uma arbitrariamente',async()=>{
 const ctx=await setup();await create(ctx);const m=await source(ctx);const existing=await p.subjectPending.findFirst({where:{user:{phone:ctx.phone}}});
 await p.subjectPending.create({data:{userId:existing.userId,phoneNumberId:ctx.account,subjectId:ctx.subject.id,title:existing.title,normalizedTitle:existing.normalizedTitle,sourceMessageId:m.id}});
 const result=await call(ctx,'update_subject_pending',{search:existing.title,pendingState:'completed'},'Conclui a pendência Assinatura do contrato do projeto Avenida Beira Rio');assert.match(result.reply,/mais de uma/);assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone},state:'completed'}}),0);
});
test('inbox executa ação sem prazo e responde somente após persistir',async()=>{
 const ctx=await setup(),m=await source(ctx);await p.incomingMessage.update({where:{id:m.id},data:{status:'received',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>intent('create_subject_pending',{subject:ctx.subject.name,subjectKind:'project',title:'Assinatura do contrato',nextAction:'Cobrar retorno'})},biz);
 assert.ok(await p.subjectPending.findUnique({where:{sourceMessageId:m.id}}));const reply=await p.replyOutbox.findUnique({where:{messageId:m.id}});assert.match(reply.text,/sem aviso agendado/);assert.match(reply.text,/Cobrar retorno/);
});
test('nova conversa retoma projeto pelo foco enviado sem aceitar outro escolhido pela IA',async()=>{
 const ctx=await setup();await p.businessSubject.create({data:{userId:ctx.subject.userId,phoneNumberId:ctx.account,kind:'project',name:'Projeto Sul',normalizedName:'projeto sul'}});
 const m=await source(ctx);await p.incomingMessage.update({where:{id:m.id},data:{status:'received',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>intent('create_subject_pending',{subject:ctx.subject.name,subjectKind:'project',title:'Assinatura do contrato'})},biz);
 await p.replyOutbox.update({where:{messageId:m.id},data:{status:'provider_accepted',finishedAt:new Date()}});await p.incomingMessage.update({where:{id:m.id},data:{status:'completed'}});
 const next=await source(ctx,'Mostra as pendências desse projeto');await p.incomingMessage.update({where:{id:next.id},data:{status:'received',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>intent('list_subject_pendings',{subject:'Projeto Sul',subjectKind:'project'})},biz);
 const response=await p.replyOutbox.findUnique({where:{messageId:next.id}});assert.match(response.text,/Avenida Beira Rio/);assert.match(response.text,/Assinatura do contrato/);assert.doesNotMatch(response.text,/Projeto Sul/);
});
test('limpeza de conteúdo apaga pendências e auditoria apenas da conta confirmada',async()=>{
 const {requestContentDeletion,confirmContentDeletion}=require('../src/domain/privacy.ts');
 const ctx=await setup();await create(ctx);const other={...ctx,account:biz+'other'};other.subject=await p.businessSubject.create({data:{userId:ctx.subject.userId,phoneNumberId:other.account,kind:'project',name:ctx.subject.name,normalizedName:ctx.subject.normalizedName}});await create(other);
 const reply=await p.$transaction(tx=>requestContentDeletion(ctx.phone,ctx.account,tx));const token=reply.match(/CONFIRMAR EXCLUSAO ([A-F0-9]{8})/)[1];const m=await source(ctx,'CONFIRMAR EXCLUSAO '+token);
 await p.$transaction(tx=>confirmContentDeletion(ctx.phone,ctx.account,tx,m));assert.equal(await p.subjectPending.count({where:{phoneNumberId:ctx.account,user:{phone:ctx.phone}}}),0);assert.equal(await p.subjectPending.count({where:{phoneNumberId:other.account,user:{phone:ctx.phone}}}),1);
});
test('meu dia mostra pendências sem prazo separadas de avisos e não mistura contas',async()=>{
 const {dayOverview}=require('../src/domain/day.overview.ts');
 const ctx=await setup();await create(ctx);const other=await setup();await call(other,'create_subject_pending',{title:'SEGREDO OUTRO CONTATO'});
 const privateCtx={...ctx,account:biz+'other'};privateCtx.subject=await p.businessSubject.create({data:{userId:ctx.subject.userId,phoneNumberId:privateCtx.account,kind:'project',name:ctx.subject.name,normalizedName:ctx.subject.normalizedName}});await call(privateCtx,'create_subject_pending',{title:'SEGREDO OUTRA CONTA'});
 const overview=await p.$transaction(tx=>dayOverview(ctx.phone,ctx.account,tx));assert.match(overview,/Nenhuma tarefa pendente para hoje/);assert.match(overview,/1 pendência de assunto sem prazo \(sem aviso agendado\)/);assert.match(overview,/Avenida Beira Rio/);assert.match(overview,/Próxima ação: Cobrar retorno/);assert.doesNotMatch(overview,/SEGREDO/);
 await call(ctx,'update_subject_pending',{search:'Assinatura do contrato',pendingState:'completed'},'Conclui a pendência Assinatura do contrato do projeto Avenida Beira Rio');
 assert.doesNotMatch(await p.$transaction(tx=>dayOverview(ctx.phone,ctx.account,tx)),/Assinatura do contrato/);
});
test('meu dia limita amostra de pendências sem perder contagem ou sugerir prazo',async()=>{
 const {dayOverview}=require('../src/domain/day.overview.ts');const ctx=await setup();
 for(let i=0;i<5;i++)await call(ctx,'create_subject_pending',{title:'Pendência '+i,nextAction:'Acompanhar andamento'});
 const overview=await p.$transaction(tx=>dayOverview(ctx.phone,ctx.account,tx));assert.match(overview,/5 pendências de assuntos sem prazo/);assert.equal((overview.match(/Próxima ação:/g)||[]).length,3);assert.match(overview,/Mostrei três atualizadas recentemente/);
 assert.equal(await p.reminder.count({where:{user:{phone:ctx.phone}}}),0);
});
