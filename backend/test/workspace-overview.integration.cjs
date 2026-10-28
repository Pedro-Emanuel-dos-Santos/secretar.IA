require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {portfolioOverview,attentionOverview,waitingOverview}=require('../src/domain/workspace.overview.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='workspace-'+randomUUID(),phones=[];
const now=new Date('2099-06-01T12:00:00Z');
async function setup(){const phone='5593'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,12))).slice(-9);phones.push(phone);const user=await p.user.create({data:{phone}});const subject=await p.businessSubject.create({data:{userId:user.id,phoneNumberId:account,kind:'project',name:'Praça Central',normalizedName:'praca central'}});await p.contactPreference.create({data:{phone,phoneNumberId:account,timezone:'America/Sao_Paulo'}});return {phone,user,subject};}
async function pending(c,extra={}){const source=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'Registro de acompanhamento',status:'completed'}});return p.subjectPending.create({data:{userId:c.user.id,phoneNumberId:account,subjectId:c.subject.id,title:'Revisar minuta',normalizedTitle:randomUUID(),sourceMessageId:source.id,state:'pending',nextAction:'Conferir os anexos',...extra}});}
const portfolio=(c,kind='project')=>p.$transaction(tx=>portfolioOverview(c.phone,account,tx,kind));
const attention=c=>p.$transaction(tx=>attentionOverview(c.phone,account,tx,now));
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[account,account+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});
test('panorama apresenta status atribuído, esperas, próxima ação e contagens sem misturar tipo/conta',async()=>{
 const c=await setup();const source=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'Status em análise',receivedAt:new Date('2099-05-30T12:00:00Z')}});
 await p.knowledgeFact.create({data:{subjectId:c.subject.id,key:'status',value:'Em análise',revision:1,sourceMessageId:source.id}});
 await pending(c);await pending(c,{title:'Assinatura',state:'waiting',waitingFor:'Evandro',nextAction:'Pedir posição'});await pending(c,{title:'ENCERRADA',state:'completed'});
 const client=await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:account,kind:'client',name:'CLIENTE_SEPARADO',normalizedName:'cliente separado'}});
 await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:account+'other',kind:'project',name:'OUTRA_CONTA',normalizedName:'outra conta'}});
 const reply=await portfolio(c);assert.match(reply,/1 cadastro · 2 pendências/);assert.match(reply,/Status informado: Em análise/);assert.match(reply,/Informado por você via WhatsApp/);assert.match(reply,/aguardando Evandro/);assert.match(reply,/Conferir os anexos/);assert.doesNotMatch(reply,/ENCERRADA|CLIENTE_SEPARADO|OUTRA_CONTA/);
 assert.match(await portfolio(c,'client'),/CLIENTE_SEPARADO/);assert.doesNotMatch(await portfolio(c,'client'),/Praça Central/);
});
test('atenção junta agenda de hoje, avisos anteriores e próximos passos sem converter prazo',async()=>{
 const c=await setup();await pending(c,{title:'Contrato',state:'waiting',waitingFor:'Maria',updatedAt:new Date('2099-05-25T12:00:00Z')});await pending(c,{title:'Definir ação',nextAction:null});
 await persistReminder({phone:c.phone,title:'AVISO_ANTERIOR',remindAt:'2099-05-31T12:00:00Z'},p,{phoneNumberId:account});
 await persistReminder({phone:c.phone,title:'AVISO_HOJE',remindAt:'2099-06-01T13:00:00Z'},p,{phoneNumberId:account});
 await persistReminder({phone:c.phone,title:'NAO_E_HOJE',remindAt:'2099-06-02T13:00:00Z'},p,{phoneNumberId:account});
 await p.appointment.create({data:{userId:c.user.id,phoneNumberId:account,subjectId:c.subject.id,title:'REUNIAO_EM_ANDAMENTO',startsAt:new Date('2099-06-01T11:30:00Z'),endsAt:new Date('2099-06-01T12:30:00Z')}});
 await p.appointment.create({data:{userId:c.user.id,phoneNumberId:account,title:'PASSOU',startsAt:new Date('2099-06-01T10:00:00Z'),endsAt:new Date('2099-06-01T11:00:00Z')}});
 const reply=await attention(c);assert.match(reply,/AVISO_ANTERIOR/);assert.match(reply,/não confirma prazo vencido/);assert.match(reply,/AVISO_HOJE/);assert.match(reply,/REUNIAO_EM_ANDAMENTO/);assert.match(reply,/aguardando Maria; sem atualização há 7 dia/);assert.match(reply,/Próxima ação ainda não registrada/);assert.doesNotMatch(reply,/NAO_E_HOJE|PASSOU/);
});
test('leitura não altera fatos, pendências, eventos ou agendas e isola outro contato',async()=>{
 const c=await setup(),other=await setup();await pending(c,{title:'PRIVADO',state:'waiting',waitingFor:'NOME_PRIVADO'});const before=await p.subjectPending.findMany({where:{userId:c.user.id}}),events=await p.event.count({where:{userId:c.user.id}});
 assert.doesNotMatch(await attention(other),/PRIVADO|NOME_PRIVADO/);assert.doesNotMatch(await p.$transaction(tx=>attentionOverview(c.phone,account+'other',tx,now)),/PRIVADO|NOME_PRIVADO/);
 await portfolio(c);await attention(c);assert.deepEqual(await p.subjectPending.findMany({where:{userId:c.user.id}}),before);assert.equal(await p.event.count({where:{userId:c.user.id}}),events);
});
test('panorama e atenção têm limite de texto e deixam visível a existência de mais registros',async()=>{
 const c=await setup();for(let i=0;i<9;i++)await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:account,kind:'project',name:'Projeto '+i+' '+('x'.repeat(100)),normalizedName:'projeto '+i}});
 for(let i=0;i<8;i++)await pending(c,{title:'Pendência '+i+' '+('y'.repeat(150)),nextAction:'z'.repeat(300)});
 const reply=await portfolio(c);assert.ok(reply.length<3600);assert.match(reply,/10 cadastros/);assert.match(reply,/seis|mais registros/);
 const overview=await attention(c);assert.ok(overview.length<3600);assert.match(overview,/8 pendências em andamento/);assert.match(overview,/outras pendências|mais registros/);
});
test('inbox executa central sem IA e respeita a data de recebimento',async()=>{
 const c=await setup();await pending(c);const m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'O que precisa da minha atenção?',receivedAt:now,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:async()=>assert.fail('não montar contexto'),interpret:async()=>assert.fail('não chamar IA')},account);
 const saved=await p.incomingMessage.findUnique({where:{id:m.id},include:{reply:true}});assert.match(saved.reply.text,/01\/06\/2099/);assert.match(saved.reply.text,/Conferir os anexos/);assert.equal(saved.lastError,null);assert.equal(await p.aiUsage.count({where:{messageId:m.id}}),0);
});
test('retornos agrupam tarefas e pendências pelo nome informado, com escopo e estado corretos',async()=>{
 const c=await setup();await pending(c,{title:'Assinatura do projeto',state:'waiting',waitingFor:'Evandro'});await pending(c,{title:'ORDEM_ENCERRADA',state:'completed',waitingFor:'Evandro'});
 const task=await persistReminder({phone:c.phone,title:'Orçamento do fornecedor',remindAt:'2099-06-02T13:00:00Z'},p,{phoneNumberId:account});await p.reminder.update({where:{id:task.id},data:{taskProgress:'waiting',waitingFor:'Evandro'}});
 const reply=await p.$transaction(tx=>waitingOverview(c.phone,account,tx));assert.match(reply,/2 acompanhamentos aguardando retorno/);assert.equal(reply.split('Aguardando: Evandro').length,2);assert.match(reply,/Assinatura do projeto/);assert.match(reply,/Orçamento do fornecedor/);assert.doesNotMatch(reply,/ORDEM_ENCERRADA/);
 assert.doesNotMatch(await p.$transaction(tx=>waitingOverview(c.phone,account+'other',tx)),/Evandro|fornecedor/);
});
test('variação interpretada usa executor do painel, não uma resposta inventada do modelo',async()=>{
 const c=await setup();await pending(c,{nextAction:'Ação efetivamente registrada'});const m=await p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:account,providerMessageId:randomUUID(),text:'Me conta como estão todos os trabalhos que deixei contigo',nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>({action:'workspace_overview',overviewKind:'projects',reply:'INVENTADO_PELO_MODELO',title:null,description:null,datetime:null,amount:null,category:null})},account);
 const saved=await p.incomingMessage.findUnique({where:{id:m.id},include:{reply:true}});assert.equal(saved.interpretation.action,'workspace_overview');assert.match(saved.reply.text,/Ação efetivamente registrada/);assert.doesNotMatch(saved.reply.text,/INVENTADO_PELO_MODELO/);
});
