require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeSubjectPending}=require('../src/domain/subject.pending.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {pendingFollowupContext,pendingFollowupIntent}=require('../src/domain/subject.pending.followup.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='followup-'+randomUUID(),phones=[];
const fields={action:'create_subject_pending',subject:'Piloto',subjectKind:'project',title:'Acompanhar assinatura',waitingFor:'Evandro',pendingState:'waiting',nextAction:'Pedir retorno',reply:'interno',description:null,datetime:null,amount:null,category:null};
const text='O Evandro respondeu, agora falta revisar o contrato.';
async function message(ctx,body,extra={}){return p.incomingMessage.create({data:{phone:ctx.phone,phoneNumberId:ctx.account,providerMessageId:randomUUID(),text:body,status:'completed',...extra}});}
async function addPending(ctx,title='Acompanhar assinatura'){
 const m=await message(ctx,`Registra no projeto ${ctx.subject.name} a pendência ${title}, aguardando Evandro; próxima ação pedir retorno.`,{interpretation:{...fields,subject:ctx.subject.name,title}});
 const reply=await p.$transaction(tx=>executeSubjectPending(ctx.phone,ctx.account,{...fields,subject:ctx.subject.name,title},tx,m.id));await p.replyOutbox.create({data:{messageId:m.id,text:reply,status:'provider_accepted',finishedAt:new Date()}});
 return {m,record:await p.subjectPending.findUniqueOrThrow({where:{sourceMessageId:m.id}})};
}
async function setup(){const phone='5575'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);const u=await p.user.create({data:{phone}});const subject=await p.businessSubject.create({data:{userId:u.id,phoneNumberId:biz,kind:'project',name:'Piloto',normalizedName:'piloto'}});const ctx={phone,account:biz,subject};return {...ctx,...await addPending(ctx)};}
const prepare=m=>prepareConversation(m,{buildContext:row=>conversationContext(p,row),interpret:async()=>assert.fail('referência segura não precisa IA')});
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});

test('retorno atualiza a mesma pendência, limpa espera e preserva fatos, origem e histórico',async()=>{
 const ctx=await setup();await p.knowledgeFact.create({data:{subjectId:ctx.subject.id,key:'contrato',value:'Ainda não foi assinado',revision:1}});
 const m=await message(ctx,text),i=await prepare(m);assert.equal(i.action,'update_subject_pending');assert.equal(i.subjectPendingId,ctx.record.id);assert.equal(i.expectedVersion,0);
 const reply=await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,i,tx,m.id));assert.match(reply,/Atualizei/);
 const row=await p.subjectPending.findUniqueOrThrow({where:{id:ctx.record.id}});assert.equal(row.state,'pending');assert.equal(row.waitingFor,null);assert.equal(row.nextAction,'revisar o contrato');assert.equal(row.version,1);assert.equal(row.sourceMessageId,ctx.m.id);
 assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone}}}),1);assert.equal(await p.reminder.count({where:{user:{phone:ctx.phone}}}),0);assert.equal((await p.knowledgeFact.findFirst({where:{subjectId:ctx.subject.id}})).value,'Ainda não foi assinado');
 const event=await p.event.findUniqueOrThrow({where:{id:'subject_pending_change:'+m.id}});assert.equal(event.payload.previous.waitingFor,'Evandro');assert.equal(event.payload.previous.nextAction,'Pedir retorno');assert.equal(event.payload.resolvedBy,'interlocutor_response');
 assert.match(await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,i,tx,m.id)),/já foi registrada/);assert.equal((await p.subjectPending.findUnique({where:{id:row.id}})).version,1);
});
test('duas pendências aguardando a mesma pessoa pedem escolha e não criam outra',async()=>{
 const ctx=await setup();await addPending(ctx,'Obter orçamento');const m=await message(ctx,text),i=await prepare(m);assert.equal(i.action,'conversation');assert.match(i.reply,/mais de uma/);assert.equal(await p.subjectPending.count({where:{user:{phone:ctx.phone},state:'waiting'}}),2);
});
test('versão alterada depois da interpretação não recebe atualização antiga',async()=>{
 const ctx=await setup(),m=await message(ctx,text),i=await prepare(m);await p.subjectPending.update({where:{id:ctx.record.id},data:{nextAction:'Outra atualização',version:{increment:1}}});
 assert.match(await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,i,tx,m.id)),/mudou/);const row=await p.subjectPending.findUnique({where:{id:ctx.record.id}});assert.equal(row.nextAction,'Outra atualização');assert.equal(row.state,'waiting');assert.equal(row.version,1);
});
test('foco pendente, expirado ou de outro contato/conta não autoriza retomada',async()=>{
 const ctx=await setup();await p.replyOutbox.update({where:{messageId:ctx.m.id},data:{status:'pending'}});assert.equal((await prepare(await message(ctx,text))).action,'conversation');
 await p.replyOutbox.update({where:{messageId:ctx.m.id},data:{status:'provider_accepted',finishedAt:new Date(Date.now()-31*60000)}});await p.incomingMessage.update({where:{id:ctx.m.id},data:{receivedAt:new Date(Date.now()-31*60000)}});assert.equal((await prepare(await message(ctx,text))).action,'conversation');
 const other=await setup(),otherMessage=await message({...other,account:biz+'other'},text);assert.equal((await prepare(otherMessage)).action,'conversation');
 const stranger='5574999990000';phones.push(stranger);assert.equal((await prepare(await message({phone:stranger,account:biz},text))).action,'conversation');assert.equal((await p.subjectPending.findUnique({where:{id:ctx.record.id}})).version,0);
});
test('mesma pessoa em dois projetos só altera o projeto discutido recentemente',async()=>{
 const ctx=await setup(),subject=await p.businessSubject.create({data:{userId:ctx.subject.userId,phoneNumberId:biz,kind:'project',name:'Outro',normalizedName:'outro'}});const second=await addPending({...ctx,subject});
 const m=await message(ctx,text),i=await prepare(m);assert.equal(i.subject,'Outro');assert.equal(i.subjectPendingId,second.record.id);await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,i,tx,m.id));assert.equal((await p.subjectPending.findUnique({where:{id:ctx.record.id}})).state,'waiting');assert.equal((await p.subjectPending.findUnique({where:{id:second.record.id}})).state,'pending');
});
test('pergunta, negação e prazo não viram alteração apesar de uma interpretação favorável',async()=>{
 const ctx=await setup();for(const body of ['O Evandro respondeu? Agora falta revisar o contrato?','O Evandro não respondeu, agora falta revisar o contrato.','Se o Evandro respondeu, agora falta revisar o contrato.','O Evandro respondeu, agora falta revisar o contrato amanhã.']){
  const i=await prepare(await message(ctx,body));assert.equal(i.action,'conversation',body);
 }
 assert.equal((await p.subjectPending.findUnique({where:{id:ctx.record.id}})).version,0);
});
test('ID inventado é removido da IA e referência forjada é revalidada no executor',async()=>{
 const ctx=await setup(),other=await setup(),m=await message(ctx,text);const valid=pendingFollowupIntent(await pendingFollowupContext(p,m));
 assert.match(await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,{...valid,subjectPendingId:other.record.id},tx,m.id)),/referência|Referência/);
 const body='Atualiza a próxima ação da pendência Acompanhar assinatura no projeto Piloto';const generic=await message(ctx,body);
 const i=await prepareConversation(generic,{buildContext:row=>conversationContext(p,row),interpret:async()=>({...fields,action:'update_subject_pending',search:'Acompanhar assinatura',subjectPendingId:other.record.id,expectedVersion:999,nextAction:'Revisar'})});assert.equal(i.subjectPendingId,undefined);assert.equal(i.expectedVersion,undefined);
});
test('inbox persiste retorno e mantém assunto em foco depois de responder',async()=>{
 const ctx=await setup(),m=await message(ctx,text,{status:'received',nextAttemptAt:new Date(0)});
 await processInboxBatch(p,{buildContext:row=>conversationContext(p,row),interpret:async()=>assert.fail('não chamar IA')},biz);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:m.id},include:{reply:true}});assert.equal(saved.interpretation.action,'update_subject_pending');assert.match(saved.reply.text,/revisar o contrato/);assert.equal(await p.aiUsage.count({where:{messageId:m.id}}),0);
 await p.replyOutbox.update({where:{messageId:m.id},data:{status:'provider_accepted',finishedAt:new Date()}});await p.incomingMessage.update({where:{id:m.id},data:{status:'completed'}});
 const context=await conversationContext(p,{phone:ctx.phone,phoneNumberId:biz,text:'E esse projeto?',receivedAt:new Date(Date.now()+10)});assert.equal(context.conversationState.focusedSubject.id,ctx.subject.id);
});
test('rollback preserva espera e próxima ação anterior',async()=>{
 const ctx=await setup(),m=await message(ctx,text),i=await prepare(m);await assert.rejects(p.$transaction(async tx=>{await executeSubjectPending(ctx.phone,biz,i,tx,m.id);throw Error('rollback');}),/rollback/);
 const row=await p.subjectPending.findUnique({where:{id:ctx.record.id}});assert.equal(row.state,'waiting');assert.equal(row.waitingFor,'Evandro');assert.equal(row.version,0);assert.equal(await p.event.count({where:{id:'subject_pending_change:'+m.id}}),0);
});
test('projeto explícito retoma após expiração sem selecionar outro assunto em foco',async()=>{
 const ctx=await setup();await p.incomingMessage.update({where:{id:ctx.m.id},data:{receivedAt:new Date(Date.now()-31*60000)}});
 const m=await message(ctx,'No projeto Piloto, o Evandro respondeu; agora falta revisar o contrato.'),i=await prepare(m);assert.equal(i.subjectPendingId,ctx.record.id);await p.$transaction(tx=>executeSubjectPending(ctx.phone,biz,i,tx,m.id));assert.equal((await p.subjectPending.findUnique({where:{id:ctx.record.id}})).state,'pending');
});
test('projeto explícito desconhecido ou de outra conta pede esclarecimento',async()=>{
 const ctx=await setup();for(const body of ['No projeto Desconhecido, o Evandro respondeu; agora falta revisar o contrato.','No projeto Piloto e Outro, o Evandro respondeu; agora falta revisar o contrato.'])assert.equal((await prepare(await message(ctx,body))).action,'conversation');
 const other=await message({...ctx,account:biz+'other'},'No projeto Piloto, o Evandro respondeu; agora falta revisar o contrato.');assert.equal((await prepare(other)).action,'conversation');
});
