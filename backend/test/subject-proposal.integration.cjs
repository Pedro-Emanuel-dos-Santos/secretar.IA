require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeSubjectProposal}=require('../src/domain/subject.proposal.ts');
const {executeFact}=require('../src/domain/business.memory.ts');
const {executeSubjectPending}=require('../src/domain/subject.pending.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='proposal-'+randomUUID(),phones=[];
const intent=(action,extra={})=>({action,reply:'interno',title:null,description:null,datetime:null,amount:null,category:null,...extra});
const message=(ctx,text,extra={})=>p.incomingMessage.create({data:{phone:ctx.phone,phoneNumberId:ctx.account,providerMessageId:randomUUID(),text,status:'completed',...extra}});
const request=()=>intent('propose_subject_update',{subject:'Avenida Beira Rio',subjectKind:'project',factKey:'status',factValue:'Contrato ainda não assinado',title:'Assinatura do contrato',pendingState:'waiting',waitingFor:'Evandro',nextAction:'Cobrar retorno sobre a assinatura'});
const original='Atualiza o projeto Avenida Beira Rio: o contrato ainda não foi assinado; cria pendência Assinatura do contrato, aguardando Evandro. Próxima ação: cobrar retorno sobre a assinatura.';
async function setup(){const phone='5576'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);const ctx={phone,account:biz};const m=await message(ctx,'Anota o status inicial do projeto Avenida Beira Rio');await p.$transaction(tx=>executeFact(phone,biz,intent('save_fact',{subject:'Avenida Beira Rio',subjectKind:'project',factKey:'status',factValue:'Em análise'}),tx,m.id));ctx.subject=await p.businessSubject.findFirst({where:{user:{phone},phoneNumberId:biz}});return ctx;}
async function propose(ctx,fields={}){const m=await message(ctx,original);const reply=await p.$transaction(tx=>executeSubjectProposal(ctx.phone,ctx.account,{...request(),...fields},tx,m.id));return {m,reply};}
async function shown(proposal,status='provider_accepted',finishedAt=new Date()){await p.replyOutbox.create({data:{messageId:proposal.m.id,text:proposal.reply,status,finishedAt}});}
async function command(ctx,text='CONFIRMAR ATUALIZAÇÃO',action='confirm_subject_update',extra={}){const m=await message(ctx,text,extra);const reply=await p.$transaction(tx=>executeSubjectProposal(ctx.phone,ctx.account,intent(action),tx,m.id));return {m,reply};}
const current=ctx=>p.knowledgeFact.findFirst({where:{subjectId:ctx.subject.id,key:'status',supersededAt:null}});
const count=ctx=>p.subjectPending.count({where:{user:{phone:ctx.phone},phoneNumberId:ctx.account}});
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});

test('proposta não altera fatos ou cria pendência antes de confirmar',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);assert.match(proposal.reply,/Ainda não alterei/);assert.equal((await current(ctx)).value,'Em análise');assert.equal(await count(ctx),0);
 const event=await p.event.findUnique({where:{id:'subject_proposal:'+proposal.m.id}});assert.equal(event.payload.status,'pending');assert.equal(event.payload.expectedFact.revision,1);
});
test('confirmação grava fato e pendência com origem e histórico na mesma operação',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);const confirmed=await command(ctx);assert.match(confirmed.reply,/As duas partes foram registradas/);
 const fact=await current(ctx),pending=await p.subjectPending.findUnique({where:{sourceMessageId:proposal.m.id}});assert.equal(fact.value,request().factValue);assert.equal(fact.revision,2);assert.equal(fact.sourceMessageId,proposal.m.id);assert.equal(pending.subjectId,ctx.subject.id);assert.equal(pending.waitingFor,'Evandro');assert.equal(pending.nextAction,request().nextAction);
 assert.equal(await p.knowledgeFact.count({where:{subjectId:ctx.subject.id}}),2);assert.equal(await p.reminder.count({where:{user:{phone:ctx.phone}}}),0);
 await p.$transaction(tx=>executeSubjectProposal(ctx.phone,ctx.account,intent('confirm_subject_update'),tx,confirmed.m.id));assert.equal(await count(ctx),1);assert.equal(await p.knowledgeFact.count({where:{subjectId:ctx.subject.id}}),2);
});
test('resposta pendente, rejeitada ou incerta não autoriza confirmação',async()=>{
 for(const status of ['pending','provider_rejected','delivery_unknown']){const ctx=await setup(),proposal=await propose(ctx);await shown(proposal,status);assert.match((await command(ctx)).reply,/envio confirmado/);assert.equal((await current(ctx)).value,'Em análise');assert.equal(await count(ctx),0);}
});
test('modelo não pode confirmar com sim, pergunta, negação ou áudio',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);
 for(const text of ['sim','ok','CONFIRMAR ATUALIZAÇÃO?','não confirmar atualização'])assert.match((await command(ctx,text)).reply,/Não alterei/);
 assert.match((await command(ctx,'CONFIRMAR ATUALIZAÇÃO','confirm_subject_update',{mediaId:'audio'})).reply,/por texto/);assert.equal(await count(ctx),0);
});
test('proposta expirada e outra resposta enviada encerram a confirmação implícita',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);const event=await p.event.findUnique({where:{id:'subject_proposal:'+proposal.m.id}});await p.event.update({where:{id:event.id},data:{payload:{...event.payload,expiresAt:new Date(Date.now()-1000).toISOString()}}});assert.match((await command(ctx)).reply,/expirou/);
 const second=await setup(),fresh=await propose(second);await shown(fresh);const other=await message(second,'Obrigado');await shown({m:other,reply:'Disponha'},'provider_accepted',new Date(Date.now()+5));assert.match((await command(second,'CONFIRMAR ATUALIZAÇÃO','confirm_subject_update',{receivedAt:new Date(Date.now()+10)})).reply,/substituída/);assert.equal(await count(second),0);
});
test('informação alterada depois da proposta não é sobrescrita',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);const m=await message(ctx,'Nova informação');await p.$transaction(tx=>executeFact(ctx.phone,biz,intent('save_fact',{subject:ctx.subject.name,subjectKind:'project',factKey:'status',factValue:'Novo documento recebido'}),tx,m.id));
 assert.match((await command(ctx)).reply,/mudou depois/);assert.equal((await current(ctx)).value,'Novo documento recebido');assert.equal(await count(ctx),0);
});
test('pendência criada depois da proposta impede duplicação e gravação parcial',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);const m=await message(ctx,'Registra pendência Assinatura do contrato no projeto Avenida Beira Rio');await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,intent('create_subject_pending',{subject:ctx.subject.name,subjectKind:'project',title:request().title}),tx,m.id));
 assert.match((await command(ctx)).reply,/já foi registrada/);assert.equal((await current(ctx)).value,'Em análise');assert.equal(await count(ctx),1);
});
test('cota de pendências recusa segunda parte e savepoint desfaz atualização factual',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);
 const data=Array.from({length:100},(_,i)=>({id:randomUUID(),phone:ctx.phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'Pendência antiga',status:'completed'}));await p.incomingMessage.createMany({data});await p.subjectPending.createMany({data:data.map((m,i)=>({userId:ctx.subject.userId,subjectId:ctx.subject.id,phoneNumberId:biz,title:'Outra '+i,normalizedTitle:'outra '+i,sourceMessageId:m.id}))});
 const response=await command(ctx);assert.match(response.reply,/Não apliquei nenhuma/);assert.match(response.reply,/100 pendências/);assert.equal((await current(ctx)).value,'Em análise');assert.equal((await current(ctx)).revision,1);assert.equal(await p.knowledgeFact.count({where:{subjectId:ctx.subject.id}}),1);assert.equal(await count(ctx),100);
});
test('falha depois da aplicação desfaz as duas partes e permite retomada',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);const m=await message(ctx,'CONFIRMAR ATUALIZAÇÃO');await assert.rejects(p.$transaction(async tx=>{await executeSubjectProposal(ctx.phone,biz,intent('confirm_subject_update'),tx,m.id);throw Error('falha commit');}),/falha commit/);
 assert.equal((await current(ctx)).value,'Em análise');assert.equal(await count(ctx),0);assert.match(await p.$transaction(tx=>executeSubjectProposal(ctx.phone,biz,intent('confirm_subject_update'),tx,m.id)),/As duas partes/);
});
test('duas confirmações concorrentes consomem a proposta uma única vez',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);await Promise.all([command(ctx),command(ctx),command(ctx)]);assert.equal(await count(ctx),1);assert.equal(await p.knowledgeFact.count({where:{subjectId:ctx.subject.id}}),2);
});
test('descarte, substituição e outro contato/conta não aplicam uma proposta antiga',async()=>{
 const ctx=await setup(),proposal=await propose(ctx);await shown(proposal);assert.match((await command(ctx,'DESCARTAR ATUALIZAÇÃO','discard_subject_update')).reply,/Descartei/);assert.match((await command(ctx)).reply,/expirou/);assert.equal(await count(ctx),0);
 const next=await propose(ctx,{title:'Nova pendência'});await shown(next);const newer=await propose(ctx,{title:'Outra proposta'});assert.match((await command(ctx)).reply,/envio confirmado/);await shown(newer);
 const other=await setup();assert.match((await command(other)).reply,/expirou/);assert.match((await command({...ctx,account:biz+'other'})).reply,/expirou/);assert.equal(await count(ctx),0);
});
test('fluxo inbox propõe e confirma sem consultar IA na mensagem de confirmação',async()=>{
 const ctx=await setup(),m=await message(ctx,original,{status:'received',nextAttemptAt:new Date(0)});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>request()},biz);const reply=await p.replyOutbox.findUnique({where:{messageId:m.id}});assert.match(reply.text,/Proposta/);assert.equal(await count(ctx),0);
 await p.replyOutbox.update({where:{messageId:m.id},data:{status:'provider_accepted',finishedAt:new Date()}});await p.incomingMessage.update({where:{id:m.id},data:{status:'completed'}});const confirmation=await message(ctx,'CONFIRMAR ATUALIZAÇÃO',{status:'received',nextAttemptAt:new Date(0)});
 const previousLimit=process.env.MAX_REQUESTS_PER_USER_PER_DAY;process.env.MAX_REQUESTS_PER_USER_PER_DAY='1';
 try{await processInboxBatch(p,{buildContext:async()=>assert.fail('não precisa contexto para comando'),interpret:async()=>assert.fail('não consulta IA')},biz);}finally{if(previousLimit===undefined)delete process.env.MAX_REQUESTS_PER_USER_PER_DAY;else process.env.MAX_REQUESTS_PER_USER_PER_DAY=previousLimit;}
 const result=await p.replyOutbox.findUnique({where:{messageId:confirmation.id}});assert.match(result.text,/As duas partes foram registradas/);assert.equal(await count(ctx),1);
 await p.replyOutbox.update({where:{id:result.id},data:{status:'provider_accepted',finishedAt:new Date()}});await p.incomingMessage.update({where:{id:confirmation.id},data:{status:'completed'}});
 const context=await conversationContext(p,{phone:ctx.phone,phoneNumberId:biz,text:'E as pendências desse projeto?',receivedAt:new Date(Date.now()+10)});assert.equal(context.conversationState.focusedSubject.id,ctx.subject.id);assert.equal(context.conversationState.pendingRequest,null);
});
