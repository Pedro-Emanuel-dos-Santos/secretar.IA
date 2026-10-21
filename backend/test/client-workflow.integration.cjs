require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {subjectOverview}=require('../src/domain/subject.overview.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='workflow-'+randomUUID(),other=biz+'other',phone='5566'+String(Date.now()).slice(-9);
const intent=(action,extra={})=>({action,reply:'interno',title:null,description:null,datetime:null,amount:null,category:null,...extra});
const now=new Date();
async function subject(name,business=biz){const user=await p.user.upsert({where:{phone},create:{phone},update:{}});return p.businessSubject.create({data:{userId:user.id,phoneNumberId:business,kind:'client',name,normalizedName:name.toLowerCase()}});}
async function row(text,interpretation,receivedAt=now,business=biz){return p.incomingMessage.create({data:{phone,phoneNumberId:business,providerMessageId:randomUUID(),text,receivedAt,status:'completed',interpretation}});}
after(async()=>{await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,other]}}});await p.$disconnect();});

test('diálogo de prestador consulta registros atuais por cliente e depois por pronome no inbox',async()=>{
 const ana=await subject('Ana'),privateAna=await subject('Ana',other);
 await p.knowledgeFact.createMany({data:[{subjectId:ana.id,key:'orcamento',value:'650 reais',revision:1},{subjectId:privateAna.id,key:'orcamento',value:'SEGREDO OUTRA CONTA',revision:1}]});
 await p.appointment.createMany({data:[{userId:ana.userId,subjectId:ana.id,phoneNumberId:biz,title:'Visita Ana',startsAt:new Date('2099-06-01T12:30:00Z')},{userId:ana.userId,subjectId:privateAna.id,phoneNumberId:other,title:'SEGREDO VISITA',startsAt:new Date('2099-06-01T12:30:00Z')}]});
 await p.event.create({data:{userId:ana.userId,type:'secretary_note',source:'secretaria',payload:{phoneNumberId:biz,text:'Ana prefere orçamento por escrito.',searchText:'ana prefere orcamento por escrito.'}}});
 await p.event.create({data:{userId:ana.userId,type:'secretary_note',source:'secretaria',payload:{phoneNumberId:biz,text:'Mariana tem outro orçamento.',searchText:'mariana tem outro orcamento.'}}});
 await row('Qual o orçamento da Ana?',intent('search_facts',{subject:'Ana',subjectKind:'client',factKey:'orcamento'}),new Date(now.getTime()-60000));
 const message=await p.incomingMessage.create({data:{phone,phoneNumberId:biz,providerMessageId:randomUUID(),text:'O que tenho com ela?',receivedAt:now,nextAttemptAt:new Date(0)}});
 await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>intent('conversation')},biz);
 const reply=await p.replyOutbox.findUnique({where:{messageId:message.id}});assert.ok(reply);assert.match(reply.text,/650 reais/);assert.match(reply.text,/Visita Ana/);assert.match(reply.text,/por escrito/);assert.doesNotMatch(reply.text,/SEGREDO|Mariana/);
 const saved=await p.incomingMessage.findUnique({where:{id:message.id}});assert.equal(saved.interpretation.action,'subject_overview');assert.equal(saved.interpretation.subject,'Ana');
 const context=await conversationContext(p,{phone,phoneNumberId:biz,text:'Qual é o orçamento dela?',receivedAt:new Date(now.getTime()+1000)});assert.equal(context.conversationState.focusedSubject.name,'Ana');
});
test('referência do cliente expira, não atravessa conta e nova tarefa encerra foco',async()=>{
 assert.equal((await conversationContext(p,{phone,phoneNumberId:biz,text:'dela',receivedAt:new Date(now.getTime()+31*60000)})).conversationState.focusedSubject,null);
 assert.equal((await conversationContext(p,{phone,phoneNumberId:other,text:'dela',receivedAt:now})).conversationState.focusedSubject,null);
 await row('Me lembra de beber água',intent('create_reminder',{title:'Beber água',datetime:'2099-01-01T12:00:00Z'}),new Date(now.getTime()+2000));
 assert.equal((await conversationContext(p,{phone,phoneNumberId:biz,text:'dela',receivedAt:new Date(now.getTime()+3000)})).conversationState.focusedSubject,null);
});
test('menção simultânea de dois clientes não deixa foco escolhido pelo modelo',async()=>{
 await subject('Bruno');for(let i=0;i<8;i++)await subject('Cliente extra '+i);
 await row('Compara Ana e Bruno',intent('search_facts',{subject:'Ana'}),new Date(now.getTime()+4000));
 const c=await conversationContext(p,{phone,phoneNumberId:biz,text:'dele',receivedAt:new Date(now.getTime()+5000)});assert.equal(c.conversationState.focusedSubject,null);
});
test('resumo recusa cliente inexistente ou parcial e limita saída',async()=>{
 const overview=(name)=>p.$transaction(tx=>subjectOverview(phone,biz,intent('subject_overview',{subject:name}),tx));
 assert.match(await overview('An'),/nome completo/);assert.match(await overview('Inexistente'),/Não encontrei/);assert.ok((await overview('Ana')).length<3500);
});
