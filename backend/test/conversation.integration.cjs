require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {executeNote,findNotes}=require('../src/domain/notes.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const business='conversation-'+randomUUID(),phone='5587'+String(Date.now()).slice(-9),otherPhone='5586'+String(Date.now()).slice(-9);
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,otherPhone]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[business,business+'-other']}}});await p.$disconnect()});
test('rascunho preserva dia depois de uma interrupção sem carregar conversa privada',async()=>{
 const receivedAt=new Date(Date.now()-3600000);
 await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'Amanhã preciso falar com João',receivedAt,status:'completed',interpretation:intent('create_reminder',{title:'falar com João',draft:{date:'2099-05-02',time:null}})}});
 await p.incomingMessage.create({data:{phoneNumberId:business+'-other',phone,providerMessageId:randomUUID(),text:'privado',status:'completed',interpretation:intent('create_reminder',{title:'privado',draft:{date:'2099-05-03',time:null}})}});
 const c=await conversationContext(p,{phone,phoneNumberId:business,text:'às nove',receivedAt:new Date()});
 assert.equal(c.conversationState.pendingRequest.draft.date,'2099-05-02');assert.equal(c.lastMessages.length,0);assert.equal(JSON.stringify(c).includes('privado'),false);
 await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'deixa pra lá',status:'completed',interpretation:intent('discard_draft')}});
 assert.equal((await conversationContext(p,{phone,phoneNumberId:business,text:'oi',receivedAt:new Date(Date.now()+1000)})).conversationState.pendingRequest,null);
});
test('anotação e resposta são atômicas, sem duplicação e com busca isolada por conta/pessoa',async()=>{
 const row=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'Anota orçamento do João',nextAttemptAt:new Date(0)}});
 const deps={buildContext:async()=>({}),interpret:async()=>intent('save_note',{description:'Orçamento do João: R$ 500, entrega na sexta.'})};
 await Promise.all([processInboxBatch(p,deps,business),processInboxBatch(p,deps,business)]);
 assert.equal(await p.event.count({where:{type:'secretary_note',user:{phone}}}),1);
 assert.equal(await p.replyOutbox.count({where:{messageId:row.id}}),1);
 await p.$transaction(tx=>executeNote(phone,business+'-other',intent('save_note',{description:'Segredo de outra conta João'}),tx));
 await p.$transaction(tx=>executeNote(otherPhone,business,intent('save_note',{description:'Segredo de outra pessoa João'}),tx));
 const found=await findNotes(p,phone,business,'joao');assert.equal(found.length,1);assert.match(found[0].text,/500/);
 const reply=await p.$transaction(tx=>executeNote(phone,business,intent('search_notes',{search:'João'}),tx));
 assert.match(reply,/500/);assert.doesNotMatch(reply,/Segredo/);
});
test('mensagem posterior espera a anterior para não perder o contexto',async()=>{
 await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'pedido anterior ainda aguardando',receivedAt:new Date(),nextAttemptAt:new Date(Date.now()+60000)}});
 const later=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'às nove',receivedAt:new Date(Date.now()+1000),nextAttemptAt:new Date(0)}});
 let calls=0;await processInboxBatch(p,{buildContext:async()=>({}),interpret:async()=>{calls++;return intent('conversation')}},business);
 assert.equal(calls,0);assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:later.id}})).status,'received');
});
