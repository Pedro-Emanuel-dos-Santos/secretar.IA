require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeSubjectPending}=require('../src/domain/subject.pending.ts');
const {executeFact}=require('../src/domain/business.memory.ts');
const {guardFactLookup}=require('../src/domain/conversation.reads.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='history-'+randomUUID(),phones=[];
const intent=(action,extra={})=>({action,reply:'interno',title:null,description:null,datetime:null,amount:null,category:null,...extra});
async function setup(){const phone='history-'+randomUUID();phones.push(phone);const user=await p.user.create({data:{phone}});const subject=await p.businessSubject.create({data:{userId:user.id,phoneNumberId:account,kind:'project',name:'Piloto',normalizedName:'piloto'}});return {phone,user,subject};}
async function change(c,action,extra,text){const m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text,status:'completed'}});return p.$transaction(tx=>executeSubjectPending(c.phone,account,intent(action,{subject:'Piloto',subjectKind:'project',...extra}),tx,m.id));}
const read=(c,extra={})=>p.$transaction(tx=>executeFact(c.phone,account,intent('search_facts',{subject:'Piloto',subjectKind:'project',includeHistory:true,...extra}),tx,'read-only'));
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:account}});await p.$disconnect();});
test('histórico mostra antes/depois e posição atual sem confundir conclusão posterior',async()=>{
 const c=await setup();
 await change(c,'create_subject_pending',{title:'Contrato',pendingState:'waiting',waitingFor:'Evandro',nextAction:'Pedir retorno'},'Registra Contrato no projeto Piloto, aguardando Evandro');
 await change(c,'update_subject_pending',{search:'Contrato',pendingState:'pending',nextAction:'Revisar contrato'},'Retoma a pendência Contrato no projeto Piloto como pendente');
 await change(c,'update_subject_pending',{search:'Contrato',pendingState:'completed'},'Conclui a pendência Contrato no projeto Piloto');
 const reply=await read(c);assert.match(reply,/Antes: aguardando; aguardando Evandro; próxima ação: Pedir retorno/);assert.match(reply,/Após essa alteração: pendente; próxima ação: Revisar contrato/);assert.match(reply,/Situação atual: concluída/);assert.match(reply,/Informado por você via WhatsApp em/);
 assert.equal(await p.subjectPending.count({where:{userId:c.user.id}}),1);assert.equal(await p.reminder.count({where:{userId:c.user.id}}),0);
});
test('consulta por campo e outro contato não revelam histórico de pendências',async()=>{
 const c=await setup(),other=await setup();
 await change(c,'create_subject_pending',{title:'Segredo'},'Registra Segredo no projeto Piloto');
 await change(c,'update_subject_pending',{search:'Segredo',nextAction:'Ligar para Evandro'},'Atualiza a pendência Segredo no projeto Piloto');
 assert.doesNotMatch(await read(other),/Segredo|Evandro/);
 assert.doesNotMatch(await read(c,{factKey:'status'}),/Segredo|Evandro/);
 const row=await p.subjectPending.findFirst({where:{userId:c.user.id}});
 await p.event.create({data:{userId:c.user.id,type:'subject_pending_updated',source:'test',payload:{phoneNumberId:account+'other',subjectId:c.subject.id,pendingId:row.id,nextAction:'NAO_REVELAR',state:'pending'}}});
 assert.doesNotMatch(await read(c),/NAO_REVELAR/);
});
test('pergunta de mudanças substitui resumo por leitura persistida sem converter escrita',()=>{
 for(const action of ['conversation','subject_overview','list_subject_pendings']){const i=intent(action);guardFactLookup(i,'O que mudou no projeto Piloto?',{subjects:[{name:'Piloto',kind:'project'}]});assert.equal(i.action,'search_facts');assert.equal(i.includeHistory,true);assert.equal(i.subject,'Piloto');}
 const write=intent('save_fact');guardFactLookup(write,'O que mudou no projeto Piloto?',{subjects:[{name:'Piloto',kind:'project'}]});assert.equal(write.action,'save_fact');
 const ambiguous=intent('subject_overview',{subject:'Piloto'});guardFactLookup(ambiguous,'O que mudou nos projetos Piloto e Escola?',{subjects:[{name:'Piloto',kind:'project'},{name:'Escola',kind:'project'}]});assert.equal(ambiguous.action,'conversation');assert.equal(ambiguous.subject,null);
 const specific=intent('search_facts');guardFactLookup(specific,'Histórico do orçamento do projeto Piloto',{subjects:[{name:'Piloto',kind:'project'}]});assert.equal(specific.factKey,'orcamento');assert.equal(specific.includeHistory,true);
});
test('auditoria sem origem compatível não é apresentada como relato do usuário',async()=>{
 const c=await setup(),other=await setup();
 await change(c,'create_subject_pending',{title:'Contrato'},'Registra Contrato no projeto Piloto');
 const row=await p.subjectPending.findFirst({where:{userId:c.user.id}});
 const foreign=await p.incomingMessage.create({data:{phone:other.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'Origem alheia'}});
 await p.event.create({data:{userId:c.user.id,type:'subject_pending_updated',source:'test',payload:{phoneNumberId:account,subjectId:c.subject.id,pendingId:row.id,sourceMessageId:foreign.id,previous:{state:'pending'},state:'pending',nextAction:'ORIGEM_ALHEIA'}}});
 assert.doesNotMatch(await read(c),/ORIGEM_ALHEIA|Informado por você/);
 assert.equal((await p.subjectPending.findUnique({where:{id:row.id}})).version,0);
});
test('inbox consulta histórico diretamente, não chama IA e não altera pendência',async()=>{
 const c=await setup();
 await change(c,'create_subject_pending',{title:'Contrato'},'Registra Contrato no projeto Piloto');
 await change(c,'update_subject_pending',{search:'Contrato',nextAction:'Revisar contrato'},'Atualiza a pendência Contrato no projeto Piloto');
 const before=await p.subjectPending.findFirst({where:{userId:c.user.id}});
 const m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'O que mudou no projeto Piloto?',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:async()=>assert.fail('consulta explícita não precisa contexto'),interpret:async()=>assert.fail('consulta explícita não precisa IA')},account);
 const saved=await p.incomingMessage.findUnique({where:{id:m.id},include:{reply:true}});
 assert.equal(saved.interpretation.action,'search_facts');assert.match(saved.reply.text,/Após essa alteração: pendente; próxima ação: Revisar contrato/);assert.equal(saved.lastError,null);
 assert.equal(await p.aiUsage.count({where:{messageId:m.id}}),0);
 assert.deepEqual(await p.subjectPending.findUnique({where:{id:before.id}}),before);
 assert.match(await read(c,{subject:'Desconhecido'}),/Não encontrei/);
 const outside=await p.$transaction(tx=>executeFact(c.phone,account+'other',saved.interpretation,tx,'read-only'));
 assert.match(outside,/Não encontrei/);assert.doesNotMatch(outside,/Revisar contrato/);
});
