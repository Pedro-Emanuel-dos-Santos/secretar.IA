require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeSubjectPending}=require('../src/domain/subject.pending.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='continuation-'+randomUUID(),phones=[];
const base={reply:'interno',title:null,description:null,datetime:null,amount:null,category:null};
async function msg(c,text,extra={}){return p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:c.account,providerMessageId:randomUUID(),text,status:'completed',...extra}});}
async function accept(m,i,reply){await p.incomingMessage.update({where:{id:m.id},data:{status:'completed',interpretation:i}});await p.replyOutbox.create({data:{messageId:m.id,text:reply,status:'provider_accepted',finishedAt:new Date()}});}
async function setup(){const phone='continue-'+randomUUID();phones.push(phone);const u=await p.user.create({data:{phone}});const subject=await p.businessSubject.create({data:{userId:u.id,phoneNumberId:account,kind:'project',name:'Piloto',normalizedName:'piloto'}});const c={phone,account,subject};
 const m=await msg(c,'Registra no projeto Piloto a pendência Contrato, aguardando Evandro');const i={...base,action:'create_subject_pending',subject:'Piloto',subjectKind:'project',title:'Contrato',pendingState:'waiting',waitingFor:'Evandro',nextAction:'Pedir retorno'};const reply=await p.$transaction(tx=>executeSubjectPending(phone,account,i,tx,m.id));await accept(m,i,reply);await p.knowledgeFact.create({data:{subjectId:subject.id,key:'contrato',value:'Ainda não foi assinado',revision:1}});return {...c,first:m,pending:await p.subjectPending.findUnique({where:{sourceMessageId:m.id}})};}
const prepare=m=>prepareConversation(m,{buildContext:x=>conversationContext(p,x),interpret:async()=>assert.fail('ciclo seguro não deve chamar IA')});
async function step(c,text){const m=await msg(c,text),i=await prepare(m);assert.equal(i.action,'update_subject_pending',i.reply);const reply=await p.$transaction(tx=>executeSubjectPending(c.phone,c.account,i,tx,m.id));await accept(m,i,reply);return {m,i,reply,row:await p.subjectPending.findUnique({where:{id:c.pending.id}})};}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[account,account+'other']}}});await p.$disconnect();});
test('consulta recente retoma pendência antiga única sem precisar repetir criação',async()=>{
 const c=await setup();await p.incomingMessage.update({where:{id:c.first.id},data:{receivedAt:new Date(Date.now()-3600000)}});
 const read=await msg(c,'Como está o projeto Piloto?');await accept(read,{...base,action:'subject_overview',subject:'Piloto',subjectKind:'project'},'Contrato aguardando Evandro');
 const result=await step(c,'Agora vou revisar o contrato');assert.equal(result.row.state,'pending');assert.equal(result.row.nextAction,'revisar o contrato');assert.equal(await p.subjectPending.count({where:{subjectId:c.subject.id}}),1);
});
test('retomada por consulta recusa ambiguidade e mudança posterior',async()=>{
 const c=await setup();await p.incomingMessage.update({where:{id:c.first.id},data:{receivedAt:new Date(Date.now()-3600000)}});
 const read=await msg(c,'Pendências do Piloto');await accept(read,{...base,action:'list_subject_pendings',subject:'Piloto',subjectKind:'project'},'Contrato aguardando Evandro');
 await p.subjectPending.update({where:{id:c.pending.id},data:{version:{increment:1},updatedAt:new Date(Date.now()+1000)}});
 assert.equal((await prepare(await msg(c,'Agora vou revisar o contrato'))).action,'conversation');
 const second=await msg(c,'Mais uma pendência');await p.$transaction(tx=>executeSubjectPending(c.phone,c.account,{...base,action:'create_subject_pending',subject:'Piloto',subjectKind:'project',title:'Orçamento'},tx,second.id));
 const again=await msg(c,'Pendências do Piloto');await accept(again,{...base,action:'list_subject_pendings',subject:'Piloto',subjectKind:'project'},'Contrato e Orçamento');
 assert.equal((await prepare(await msg(c,'Pode concluir essa pendência'))).action,'conversation');
});
test('ciclo completo retoma, aguarda por pronome, troca pessoa e conclui a mesma pendência',async()=>{
 const c=await setup();await step(c,'O Evandro respondeu, agora falta revisar o contrato');
 let r=await step(c,'Já revisei, agora falta ele assinar');assert.equal(r.row.waitingFor,'Evandro');assert.equal(r.row.nextAction,'assinar');assert.equal(r.row.state,'waiting');assert.match(r.reply,/aguardando Evandro/);
 const repeated=await step(c,'Agora falta ele assinar');assert.equal(repeated.row.version,2);assert.equal((await p.event.findUnique({where:{id:'subject_pending_change:'+repeated.m.id}})).type,'subject_pending_focused');
 r=await step(c,'Agora estou aguardando Maria');assert.equal(r.row.waitingFor,'Maria');assert.equal(r.row.nextAction,null);
 r=await step(c,'Agora vou conferir o documento');assert.equal(r.row.waitingFor,null);assert.equal(r.row.state,'pending');
 r=await step(c,'Já conferi, agora falta ela assinar');assert.equal(r.row.waitingFor,'Maria');
 r=await step(c,'Já assinou, pode concluir essa pendência');assert.equal(r.row.state,'completed');assert.equal(r.row.version,6);assert.equal(r.row.sourceMessageId,c.first.id);assert.match(r.reply,/Concluí/);
 assert.equal(await p.subjectPending.count({where:{user:{phone:c.phone}}}),1);assert.equal(await p.reminder.count({where:{user:{phone:c.phone}}}),0);assert.equal((await p.knowledgeFact.findFirst({where:{subjectId:c.subject.id}})).value,'Ainda não foi assinado');
 const event=await p.event.findUnique({where:{id:'subject_pending_change:'+r.m.id}});assert.equal(event.payload.previous.waitingFor,'Maria');assert.equal(event.payload.resolvedBy,'conversation_continuation');
});
test('reinício preserva referência persistida e consulta do mesmo projeto mantém foco',async()=>{
 const c=await setup();await step(c,'O Evandro respondeu, agora falta revisar o contrato');
 const m=await msg(c,'O que mudou no projeto Piloto?');await accept(m,{...base,action:'search_facts',subject:'Piloto',subjectKind:'project',includeHistory:true},'Histórico registrado');
 const r=await step(c,'Já revisei, agora falta ele assinar');assert.equal(r.row.waitingFor,'Evandro');
 assert.match(await p.$transaction(tx=>executeSubjectPending(c.phone,c.account,r.i,tx,r.m.id)),/já foi registrada/);assert.equal((await p.subjectPending.findUnique({where:{id:c.pending.id}})).version,2);
 assert.equal((await step(c,'Pode finalizar')).row.state,'completed');
});
test('expiração, outra conta, resposta incerta e novo assunto não autorizam referência',async()=>{
 const c=await setup();await p.incomingMessage.update({where:{id:c.first.id},data:{receivedAt:new Date(Date.now()-31*60000)}});assert.equal((await prepare(await msg(c,'Agora vou revisar o contrato'))).action,'conversation');
 const other=await setup();assert.equal((await prepare(await msg({...other,account:account+'other'},'Já revisei, agora falta ele assinar'))).action,'conversation');
 await p.replyOutbox.update({where:{messageId:other.first.id},data:{status:'unknown'}});assert.equal((await prepare(await msg(other,'Agora vou revisar o contrato'))).action,'conversation');
 const third=await setup();const unrelated=await msg(third,'Anota compras');await accept(unrelated,{...base,action:'save_note',description:'compras'},'Anotado');assert.equal((await prepare(await msg(third,'Agora vou revisar o contrato'))).action,'conversation');
});
test('versão concorrente e ID forjado não alteram outra pendência',async()=>{
 const c=await setup(),other=await setup(),m=await msg(c,'Agora vou revisar o contrato'),i=await prepare(m);
 assert.match(await p.$transaction(tx=>executeSubjectPending(c.phone,c.account,{...i,subjectPendingId:other.pending.id},tx,m.id)),/mudou|mudaram/);
 await p.subjectPending.update({where:{id:c.pending.id},data:{version:{increment:1},nextAction:'Atualização concorrente'}});
 assert.match(await p.$transaction(tx=>executeSubjectPending(c.phone,c.account,i,tx,m.id)),/mudou|mudaram|referência/);assert.equal((await p.subjectPending.findUnique({where:{id:c.pending.id}})).nextAction,'Atualização concorrente');
});
test('rollback desfaz atualização e auditoria; pronome sem pessoa pede só a informação faltante',async()=>{
 const c=await setup(),m=await msg(c,'Agora vou revisar o contrato'),i=await prepare(m);
 await assert.rejects(p.$transaction(async tx=>{await executeSubjectPending(c.phone,c.account,i,tx,m.id);throw Error('rollback');}),/rollback/);assert.equal((await p.subjectPending.findUnique({where:{id:c.pending.id}})).version,0);assert.equal(await p.event.count({where:{id:'subject_pending_change:'+m.id}}),0);
 await p.incomingMessage.update({where:{id:m.id},data:{status:'failed'}});
 await p.event.update({where:{id:'subject_pending_change:'+c.first.id},data:{payload:{phoneNumberId:account,sourceMessageId:c.first.id,pendingId:c.pending.id,version:0}}});const unknown=await prepare(await msg(c,'Já revisei, agora falta ele assinar'));assert.equal(unknown.action,'conversation');assert.match(unknown.reply,/Quem/);
});
test('inbox executa continuação sem IA e entrega resposta natural sem criar outra tarefa',async()=>{
 const c=await setup(),m=await msg(c,'Agora vou revisar o contrato',{status:'received',nextAttemptAt:new Date(0)});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>assert.fail('não chamar IA')},account);
 const saved=await p.incomingMessage.findUnique({where:{id:m.id},include:{reply:true}});assert.equal(saved.interpretation.action,'update_subject_pending');assert.match(saved.reply.text,/Próxima ação: revisar o contrato/);assert.equal(await p.aiUsage.count({where:{messageId:m.id}}),0);assert.equal(await p.subjectPending.count({where:{user:{phone:c.phone}}}),1);
});
test('proposta aplicada também mantém referência, mas proposta não confirmada não autoriza',async()=>{
 const c=await setup(),confirmation=await msg(c,'CONFIRMAR ATUALIZAÇÃO');await accept(confirmation,{...base,action:'confirm_subject_update'},'Atualização confirmada');
 const event=await p.event.create({data:{userId:c.subject.userId,type:'subject_update_proposal',source:'test',payload:{phoneNumberId:account,confirmationMessageId:confirmation.id,status:'applied',pendingId:c.pending.id,request:{waitingFor:'Evandro'}}}});
 const r=await step(c,'Já revisei, agora falta ele assinar');assert.equal(r.row.waitingFor,'Evandro');
 const second=await setup(),unconfirmed=await msg(second,'CONFIRMAR ATUALIZAÇÃO');await accept(unconfirmed,{...base,action:'confirm_subject_update'},'Não apliquei');
 await p.event.create({data:{userId:second.subject.userId,type:'subject_update_proposal',source:'test',payload:{phoneNumberId:account,confirmationMessageId:unconfirmed.id,status:'pending',pendingId:second.pending.id}}});
 assert.equal((await prepare(await msg(second,'Agora vou revisar o contrato'))).action,'conversation');
});

test('proposta que atualizou pendência conserva a versão aplicada na conversa',async()=>{
 const c=await setup();await p.subjectPending.update({where:{id:c.pending.id},data:{version:1,state:'pending',waitingFor:null,nextAction:'Revisar anexos'}});
 const confirmation=await msg(c,'CONFIRMAR ATUALIZAÇÃO');await accept(confirmation,{...base,action:'confirm_subject_update'},'Atualização confirmada');
 await p.event.create({data:{userId:c.subject.userId,type:'subject_update_proposal',source:'test',payload:{phoneNumberId:account,confirmationMessageId:confirmation.id,status:'applied',pendingId:c.pending.id,pendingVersion:1,request:{waitingFor:null}}}});
 const result=await step(c,'Agora vou conferir o contrato');assert.equal(result.row.id,c.pending.id);assert.equal(result.row.version,2);assert.equal(result.row.nextAction,'conferir o contrato');assert.equal(await p.subjectPending.count({where:{userId:c.subject.userId}}),1);
});
