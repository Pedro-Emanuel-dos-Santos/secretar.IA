require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executePersonalMemory,findPersonalMemories}=require('../src/domain/personal.memory.ts');
const {executeLocalCommand}=require('../src/domain/local.commands.ts');
const {personalMemoryConsent}=require('../src/domain/personal.memory.consent.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {requestContentDeletion,confirmContentDeletion}=require('../src/domain/privacy.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='memory-'+randomUUID(),phones=[];
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
function owner(){const phone='5573'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);return phone;}
const source=(phone,text,data={},account=biz)=>p.incomingMessage.create({data:{phone,phoneNumberId:account,providerMessageId:randomUUID(),text,status:'completed',...data}});
async function local(phone,command,text,accepted=true,account=biz){const m=await source(phone,text,{},account),reply=await p.$transaction(tx=>executeLocalCommand(command,phone,account,tx,m));await p.replyOutbox.create({data:{messageId:m.id,text:reply,status:accepted?'provider_accepted':'pending',finishedAt:accepted?new Date():null}});return reply;}
async function consent(phone){await local(phone,'memory_info','MEMORIA PESSOAL');assert.match(await local(phone,'memory_accept','ACEITO MEMORIA'),/ativada/);}
async function remember(phone,text='Prefiro resolver pendências pela manhã',label='Horário preferido'){
 const i=intent('remember_personal',{title:label,description:text,memoryKind:'preference'}),m=await source(phone,'Guarda que '+text,{interpretation:i});
 const reply=await p.$transaction(tx=>executePersonalMemory(phone,biz,i,tx,m));await p.replyOutbox.create({data:{messageId:m.id,text:reply,status:'provider_accepted',finishedAt:new Date()}});return {m,reply};
}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,biz+'other']}}});await p.contactPreference.deleteMany({where:{phoneNumberId:biz}});await p.$disconnect();});
test('memória exige explicação enviada e consentimento específico por contato e conta',async()=>{
 const phone=owner();assert.match((await remember(phone)).reply,/ACEITO MEMORIA/);assert.equal((await findPersonalMemories(p,phone,biz)).length,0);
 assert.match(await local(phone,'memory_accept','ACEITO MEMORIA'),/ativada/);
});
test('consentimento sem explicação ou explicação pendente não habilita envio à OpenAI',async()=>{
 const phone=owner();const first=await local(phone,'memory_accept','ACEITO MEMORIA',false);assert.match(first,/enviadas à OpenAI/);assert.equal(await personalMemoryConsent(p,phone,biz),false);
 await local(phone,'memory_accept','ACEITO MEMORIA',false);assert.equal(await personalMemoryConsent(p,phone,biz),false);
 await consent(phone);assert.equal(await personalMemoryConsent(p,phone,biz),true);assert.equal(await personalMemoryConsent(p,phone,biz+'other'),false);assert.equal(await personalMemoryConsent(p,owner(),biz),false);
});
test('memória persistida tem origem, consulta por assunto e não sobrescreve conflito silenciosamente',async()=>{
 const phone=owner();await consent(phone);const {m}=await remember(phone);
 const [saved]=await findPersonalMemories(p,phone,biz,'pendências');assert.equal(saved.sourceMessageId,m.id);assert.equal(saved.version,0);assert.equal(saved.kind,'preference');
 assert.match((await remember(phone)).reply,/já está guardada/);assert.match((await remember(phone,'Prefiro a noite')).reply,/atualizar/);assert.equal((await findPersonalMemories(p,phone,biz)).length,1);
 assert.equal((await findPersonalMemories(p,phone,biz+'other')).length,0);assert.equal((await findPersonalMemories(p,owner(),biz)).length,0);
});
test('correção e exclusão conferem versão, alvo único e escopo',async()=>{
 const phone=owner();await consent(phone);await remember(phone);const [memory]=await findPersonalMemories(p,phone,biz);
 const m=await source(phone,'Corrige minha preferência: prefiro a tarde');
 assert.match(await p.$transaction(tx=>executePersonalMemory(phone,biz,intent('update_personal',{memoryId:memory.id,description:'Prefiro a tarde',expectedVersion:9}),tx,m)),/atualizada/);
 assert.match(await p.$transaction(tx=>executePersonalMemory(phone,biz,intent('update_personal',{memoryId:memory.id,description:'Prefiro a tarde',expectedVersion:0}),tx,m)),/Atualizei/);
 const current=(await findPersonalMemories(p,phone,biz))[0];assert.equal(current.version,1);assert.equal(current.sourceMessageId,m.id);
 const other=owner(),foreign=await source(other,'Apaga essa preferência');assert.match(await p.$transaction(tx=>executePersonalMemory(other,biz,intent('forget_personal',{memoryId:memory.id}),tx,foreign)),/Não encontrei/);
 const deletion=await source(phone,'Apaga essa preferência');assert.match(await p.$transaction(tx=>executePersonalMemory(phone,biz,intent('forget_personal',{memoryId:memory.id,expectedVersion:1}),tx,deletion)),/Removi/);assert.equal((await findPersonalMemories(p,phone,biz)).length,0);
});
test('revogação remove memórias e suas respostas do contexto mas permite consulta local',async()=>{
 const phone=owner();await consent(phone);await remember(phone,'Meu filho se chama Caio','Nome do filho');
 const input=()=>({phone,phoneNumberId:biz,text:'Olá',receivedAt:new Date(Date.now()+1000)});
 assert.equal((await conversationContext(p,input())).personalMemories.length,1);
 const reflection=await source(phone,'Sobre minha família',{interpretation:intent('conversation')});await p.replyOutbox.create({data:{messageId:reflection.id,text:'Você me contou sobre Caio.',status:'provider_accepted',finishedAt:new Date()}});
 await local(phone,'memory_list','MINHAS MEMORIAS');await local(phone,'memory_revoke','DESATIVAR MEMORIA');
 const c=await conversationContext(p,input());assert.equal(c.personalMemoryEnabled,false);assert.equal(c.personalMemories.length,0);assert.equal(JSON.stringify(c).includes('Caio'),false);
 assert.match(await local(phone,'memory_list','MINHAS MEMORIAS'),/Caio/);assert.equal((await findPersonalMemories(p,phone,biz)).length,1);
});
test('inbox grava memória e resposta uma vez sem criar lembrete ou compromisso',async()=>{
 const phone=owner();await consent(phone);const i=intent('remember_personal',{memoryKind:'goal',title:'Tempo em família',description:'Quero levar meu filho ao parque'});
 const m=await source(phone,'Guarda que quero levar meu filho ao parque',{status:'received',nextAttemptAt:new Date(0)});
 const deps={buildContext:m=>conversationContext(p,m),interpret:async()=>i};await processInboxBatch(p,deps,biz);await processInboxBatch(p,deps,biz);
 assert.equal((await findPersonalMemories(p,phone,biz)).length,1);assert.equal(await p.replyOutbox.count({where:{messageId:m.id}}),1);assert.equal(await p.reminder.count({where:{user:{phone}}}),0);assert.equal(await p.appointment.count({where:{user:{phone}}}),0);
});
test('troca de provedor bloqueia memória até nova configuração compatível',async()=>{
 const phone=owner();await consent(phone);await remember(phone,'Prefiro silêncio para trabalhar','Concentração');
 const previous=process.env.AI_MODE;try{process.env.AI_MODE='ollama';const c=await conversationContext(p,{phone,phoneNumberId:biz,text:'Oi',receivedAt:new Date(Date.now()+1000)});assert.equal(c.personalMemoryEnabled,false);assert.equal(JSON.stringify(c).includes('silêncio'),false);}finally{process.env.AI_MODE=previous;}
});
test('gravações concorrentes da mesma informação produzem uma memória',async()=>{
 const phone=owner();await consent(phone);await Promise.all([remember(phone),remember(phone)]);assert.equal((await findPersonalMemories(p,phone,biz)).length,1);
});
test('limpeza completa remove memórias e consentimento somente da conta pedida',async()=>{
 const phone=owner();await consent(phone);await remember(phone);
 const request=await p.$transaction(tx=>requestContentDeletion(phone,biz,tx)),token=request.match(/CONFIRMAR EXCLUSAO ([A-F0-9]{8})/)[1];
 const m=await source(phone,'CONFIRMAR EXCLUSAO '+token);assert.match(await p.$transaction(tx=>confirmContentDeletion(phone,biz,tx,m)),/Limpei/);
 assert.equal((await findPersonalMemories(p,phone,biz)).length,0);assert.equal(await personalMemoryConsent(p,phone,biz),false);
});
