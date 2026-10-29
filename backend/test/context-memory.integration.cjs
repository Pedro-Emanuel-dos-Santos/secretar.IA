require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {retrieveContext}=require('../src/domain/context.retrieval.ts'),{executeContextRecall}=require('../src/domain/context.recall.ts');
const {executePersonalMemory}=require('../src/domain/personal.memory.ts');
const {memoryDisclosure,setPersonalMemoryConsent}=require('../src/domain/personal.memory.consent.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts'),{prepareConversation}=require('../src/domain/conversation.processor.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {executeNote}=require('../src/domain/notes.ts');
const {executeAppointment}=require('../src/domain/appointments.ts');
const p=createPrismaClient(require('./integration.database.cjs')),account='context-'+randomUUID(),phones=[];
process.env.AI_MODE='openai';
const base={reply:'interno',title:null,description:null,datetime:null,amount:null,category:null};
async function setup(){const phone='5584'+String(Date.now()).slice(-8)+phones.length;phones.push(phone);const user=await p.user.create({data:{phone}});return {phone,user,account};}
const message=(c,text,extra={})=>p.incomingMessage.create({data:{phone:c.phone,phoneNumberId:c.account,providerMessageId:randomUUID(),text,status:'completed',...extra}});
async function accept(m,reply){await p.incomingMessage.update({where:{id:m.id},data:{status:'completed'}});await p.replyOutbox.upsert({where:{messageId:m.id},update:{status:'provider_accepted',finishedAt:new Date()},create:{messageId:m.id,text:reply || 'Registrado',status:'provider_accepted',finishedAt:new Date()}});}
async function consent(c){const m=await message(c,'MEMORIA');const disclosure=await p.$transaction(tx=>memoryDisclosure(c.phone,c.account,tx,m.id));await accept(m,disclosure);await p.$transaction(tx=>setPersonalMemoryConsent(c.phone,c.account,true,tx,m.id));}
async function memory(c,text,title='Carreira',kind='goal'){
 const old=new Date(Date.now()-12*86400000),intent={...base,action:'remember_personal',title,description:text,memoryKind:kind};const m=await message(c,'Guarde na memória: '+text,{receivedAt:old,interpretation:intent});await p.$transaction(tx=>executePersonalMemory(c.phone,c.account,intent,tx,m));
 const row=await p.event.findFirstOrThrow({where:{userId:c.user.id,type:'personal_memory',payload:{path:['sourceMessageId'],equals:m.id}}});await p.event.update({where:{id:row.id},data:{createdAt:old,payload:{...row.payload,updatedAt:old.toISOString()}}});return {row:await p.event.findUniqueOrThrow({where:{id:row.id}}),m};
}
async function appointment(c,title='Entrevista técnica'){
 const old=new Date(Date.now()-10*86400000),m=await message(c,'Registra '+title,{receivedAt:old}),count=await p.appointment.count({where:{userId:c.user.id}});
 const datetime=new Date(Date.parse('2099-06-02T17:00:00Z')+count*2*3600000).toISOString();
 await p.$transaction(tx=>executeAppointment(c.phone,c.account,{...base,action:'create_appointment',title,datetime,durationMinutes:60,alertMinutes:[15]},tx,m.id));
 const row=await p.appointment.findUniqueOrThrow({where:{sourceMessageId:m.id}});return p.appointment.update({where:{id:row.id},data:{createdAt:old,updatedAt:old}});
}
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[account,account+'other']}}});await p.contactPreference.deleteMany({where:{phone:{in:phones}}});await p.$disconnect();});
test('A: recupera área profissional após doze dias por conceito, com origem e sem IA',async()=>{
 const c=await setup();await consent(c);const saved=await memory(c,'Estou em busca de emprego em desenvolvimento de software.');
 const text='Você lembra da área em que estou procurando trabalho?',m=await message(c,text,{status:'received'});
 await processInboxBatch(p,{buildContext:()=>assert.fail(),interpret:()=>assert.fail('consulta factual dispensa IA')},c.account);
 const row=await p.incomingMessage.findUniqueOrThrow({where:{id:m.id},include:{reply:true}});assert.equal(row.interpretation.action,'recall_context');assert.match(row.reply.text,/desenvolvimento de software/);assert.match(row.reply.text,/memória autorizada/);assert.equal(await p.aiUsage.count({where:{messageId:m.id}}),0);
 const result=await retrieveContext(p,c.phone,c.account,'trabalho');assert.equal(result.items[0].id,saved.row.id);assert.equal(result.items[0].sourceMessageId,saved.m.id);assert.equal(result.items[0].recordedAt,saved.row.createdAt.toISOString());assert.ok(result.items[0].matchedConcepts.includes('employment'));
 console.log(JSON.stringify({scenario:'A',savedDaysAgo:12,query:'trabalho',recovered:'desenvolvimento de software',providerCalls:0,sourceVerified:true}));
});
test('busca antiga não depende das onze memórias recentes do preview',async()=>{
 const c=await setup();await consent(c);const old=await memory(c,'Quero aprender a língua inglesa diariamente.','Idioma');
 for(let i=0;i<14;i++)await p.event.create({data:{userId:c.user.id,type:'personal_memory',source:'fixture',payload:{phoneNumberId:c.account,kind:'preference',label:'Cor '+i,text:'Prefiro azul '+i,searchText:'prefiro azul '+i,version:0,sourceMessageId:old.m.id,updatedAt:new Date().toISOString()}}});
 const ctx=await conversationContext(p,{phone:c.phone,phoneNumberId:c.account,text:'Me ajuda a estudar inglês?',receivedAt:new Date()});assert.ok(!ctx.personalMemories.some(r=>r.id===old.row.id));assert.ok(ctx.contextualMemory.items.some(r=>r.id===old.row.id));
});
test('B: conselho recebe entrevista registrada dias antes, sem criar tarefa ou convite',async()=>{
 const c=await setup(),event=await appointment(c);const m=await message(c,'Como posso me preparar para aquela entrevista?',{status:'received'});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async ctx=>{
  const found=ctx.contextualMemory.items.find(r=>r.id===event.id);assert.equal(found.kind,'appointment');assert.equal(found.sourceMessageId,event.sourceMessageId);assert.equal(ctx.lastMessages.some(r=>r.user.includes('Registra Entrevista')),false);
  return {...base,action:'conversation',reply:'Você registrou uma entrevista técnica. Sugiro revisar os requisitos e preparar exemplos do seu trabalho.'};
 }},c.account);
 assert.equal(await p.appointment.count({where:{userId:c.user.id}}),1);assert.equal(await p.reminder.count({where:{userId:c.user.id}}),1);assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:m.id},include:{reply:true}})).reply.status,'pending');
 console.log(JSON.stringify({scenario:'B',savedDaysAgo:10,recovered:'Entrevista técnica',actionsCreated:0,suggestionIsFixture:true}));
});
test('continuidade com múltiplos pedidos propõe antes de criar nota e lembrete, preservando origem',async()=>{
 const c=await setup(),event=await appointment(c),text='Organiza minha preparação para aquela entrevista: anota que preciso revisar meus projetos e me lembra de preparar o portfólio amanhã às 10h.';
 const proposal=await message(c,text,{status:'received'});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async ctx=>{assert.ok(ctx.contextualMemory.items.some(r=>r.id===event.id));return {...base,action:'assistant_plan',planSteps:[{action:'save_note',description:'Preparação: revisar meus projetos.'},{action:'create_reminder',title:'Preparar portfólio',datetime:new Date(Date.now()+86400000).toISOString()}]};}},c.account);
 assert.equal(await p.event.count({where:{userId:c.user.id,type:'secretary_note'}}),0);assert.equal(await p.reminder.count({where:{userId:c.user.id}}),1);
 await accept(proposal);await message(c,'pode fazer',{status:'received'});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:()=>assert.fail('confirmação contextual dispensa IA')},c.account);
 const note=await p.event.findFirstOrThrow({where:{userId:c.user.id,type:'secretary_note'}});assert.equal(note.payload.sourceMessageId,proposal.id);assert.equal(await p.reminder.count({where:{userId:c.user.id}}),2);assert.equal(await p.appointment.count({where:{userId:c.user.id}}),1);
});
test('assuntos semelhantes geram escolha, nunca foco arbitrário',async()=>{
 const c=await setup();await appointment(c,'Entrevista Alfa');await appointment(c,'Entrevista Beta');
 const query=await message(c,'Você lembra daquela entrevista?');const reply=await p.$transaction(tx=>executeContextRecall(tx,c.phone,c.account,query.text,new Date(),query.id));assert.match(reply,/mais de um/);assert.equal(await p.event.count({where:{id:'context_recall:'+query.id}}),0);const result=await retrieveContext(p,c.phone,c.account,'entrevista');assert.equal(result.ambiguous,true);
});
test('C: consulta antiga entregue estabelece foco único e correção troca 14h por 16h no mesmo dia',async()=>{
 const c=await setup(),event=await appointment(c,'Reunião do contrato');const query=await message(c,'Você lembra daquela reunião?',{status:'received'});
 await processInboxBatch(p,{buildContext:()=>assert.fail(),interpret:()=>assert.fail()},c.account);await accept(query);
 const correction=await message(c,'Na verdade, mudou para as 16h.',{status:'received'});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async ctx=>{assert.equal(ctx.conversationState.focusedAppointment.id,event.id);return {...base,action:'reschedule_appointment',appointmentId:'invented',datetime:'2099-07-15T16:00:00Z'};}},c.account);
 const changed=await p.appointment.findUniqueOrThrow({where:{id:event.id}}),outcome=await p.incomingMessage.findUniqueOrThrow({where:{id:correction.id},include:{reply:true}});assert.equal(changed.startsAt.toISOString(),'2099-06-02T19:00:00.000Z',JSON.stringify({interpretation:outcome.interpretation,status:outcome.status,reply:outcome.reply?.text}));assert.equal(changed.version,1);assert.equal(await p.appointment.count({where:{userId:c.user.id}}),1);
 console.log(JSON.stringify({scenario:'C',before:'14:00',after:'16:00',timezone:'America/Sao_Paulo',sameRecord:changed.id===event.id,sameDate:true}));
});
test('foco de consulta não enviada ou alterada depois não autoriza correção antiga',async()=>{
 const c=await setup(),event=await appointment(c,'Reunião do contrato');const query=await message(c,'Você lembra daquela reunião?');await p.$transaction(tx=>executeContextRecall(tx,c.phone,c.account,query.text,new Date(),query.id));await p.incomingMessage.update({where:{id:query.id},data:{interpretation:{...base,action:'recall_context'}}});
 for(const changed of [false,true]){
  if(changed){await accept(query);await p.appointment.update({where:{id:event.id},data:{version:{increment:1}}});}
  const m=await message(c,'Na verdade, mudou para as 16h.');const intent=await prepareConversation(m,{buildContext:x=>conversationContext(p,x),interpret:async()=>({...base,action:'reschedule_appointment',appointmentId:event.id,datetime:'2099-06-02T19:00:00Z'})});assert.equal(intent.action,'conversation');assert.equal(intent.appointmentId,null);
 }
});
test('correção e exclusão de memória não ressuscitam texto antigo nem mensagens originais',async()=>{
 const c=await setup();await consent(c);const saved=await memory(c,'Busco emprego em desenvolvimento de software.');
 const update={...base,action:'update_personal',memoryId:saved.row.id,expectedVersion:0,description:'Busco emprego em análise de dados.'};const source=await message(c,'Atualiza minha memória de carreira para análise de dados',{interpretation:update});await p.$transaction(tx=>executePersonalMemory(c.phone,c.account,update,tx,source));
 let result=await retrieveContext(p,c.phone,c.account,'trabalho');assert.match(result.items[0].text,/análise de dados/);assert.doesNotMatch(JSON.stringify(result),/desenvolvimento de software/);assert.equal(result.items[0].version,1);assert.equal(result.items[0].sourceMessageId,source.id);
 const deletion={...base,action:'forget_personal',memoryId:saved.row.id,expectedVersion:1},d=await message(c,'Esqueça minha memória de carreira',{interpretation:deletion});await p.$transaction(tx=>executePersonalMemory(c.phone,c.account,deletion,tx,d));
 result=await retrieveContext(p,c.phone,c.account,'trabalho');assert.equal(result.items.length,0);const ctx=await conversationContext(p,{phone:c.phone,phoneNumberId:c.account,text:'trabalho',receivedAt:new Date()});assert.doesNotMatch(JSON.stringify(ctx),/análise de dados|desenvolvimento de software/);
});
test('consentimento, revogação e isolamento por pessoa/conta valem na recuperação',async()=>{
 const c=await setup(),other=await setup();await consent(c);await memory(c,'Busco emprego em desenvolvimento de software.');
 assert.equal((await retrieveContext(p,other.phone,c.account,'trabalho')).items.length,0);assert.equal((await retrieveContext(p,c.phone,c.account+'other','trabalho')).items.length,0);
 await p.$transaction(tx=>setPersonalMemoryConsent(c.phone,c.account,false,tx));assert.equal((await retrieveContext(p,c.phone,c.account,'trabalho')).items.length,0);
});
test('fatos substituídos e informação nunca autorizada não viram lembranças',async()=>{
 const c=await setup();await message(c,'Tenho uma entrevista, mas não guarde isso como memória.',{receivedAt:new Date(Date.now()-12*86400000),interpretation:{...base,action:'conversation'}});assert.equal((await retrieveContext(p,c.phone,c.account,'entrevista')).items.length,0);
 const subject=await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:c.account,name:'Praça',normalizedName:'praca',kind:'project'}});await p.knowledgeFact.createMany({data:[{subjectId:subject.id,key:'orcamento',value:'100 fictícios',revision:1,supersededAt:new Date()},{subjectId:subject.id,key:'orcamento',value:'200 fictícios',revision:2}]});
 const result=await retrieveContext(p,c.phone,c.account,'cotação');assert.equal(result.items.length,1);assert.match(result.items[0].text,/200/);assert.doesNotMatch(JSON.stringify(result),/100 fictícios/);
});
test('nome de projeto sem acento recupera tarefa e acompanhamento vinculados',async()=>{
 const c=await setup(),subject=await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:c.account,name:'Praça Central',normalizedName:'praca central',kind:'project'}}),source=await message(c,'Registra acompanhamento da Praça Central');
 await p.subjectPending.create({data:{userId:c.user.id,phoneNumberId:c.account,subjectId:subject.id,title:'Revisar contrato',normalizedTitle:'revisar contrato',sourceMessageId:source.id}});
 await p.reminder.create({data:{userId:c.user.id,subjectId:subject.id,title:'Entregar anexos',remindAt:new Date('2099-06-01T13:00:00Z'),sourceMessageId:source.id,scheduleOutbox:{create:{phoneNumberId:c.account}}}});
 const result=await retrieveContext(p,c.phone,c.account,'praca central');assert.ok(result.items.some(r=>r.kind==='pending'));assert.ok(result.items.some(r=>r.kind==='reminder'));assert.ok(result.items.every(r=>r.subject==='Praça Central'));
});
test('pedido de não guardar prevalece mesmo quando modelo sugere anotação',async()=>{
 const c=await setup(),m=await message(c,'Estou buscando emprego. Não guarde isso como memória nem anotação.',{status:'received'});
 await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>({...base,action:'save_note',description:'Estou buscando emprego.'})},c.account);
 const row=await p.incomingMessage.findUniqueOrThrow({where:{id:m.id},include:{reply:true}});assert.equal(row.interpretation.action,'conversation');assert.match(row.reply.text,/Não salvei/);assert.equal(await p.event.count({where:{userId:c.user.id,type:{in:['secretary_note','personal_memory']}}}),0);assert.equal((await retrieveContext(p,c.phone,c.account,'trabalho')).items.length,0);
});

test('recuperação lexical de tarefa preserva OR de escopo para o mesmo telefone em outra conta',async()=>{
 const c=await setup(),m=await message(c,'Me lembra de preparar portfólio para entrevista técnica');
 const reminder=await p.reminder.create({data:{userId:c.user.id,title:'Preparar portfólio para entrevista técnica',remindAt:new Date('2099-06-02T13:00:00Z'),sourceMessageId:m.id,scheduleOutbox:{create:{phoneNumberId:c.account}}}});
 assert.ok((await retrieveContext(p,c.phone,c.account,'entrevista')).items.some(r=>r.id===reminder.id));
 assert.equal((await retrieveContext(p,c.phone,c.account+'other','entrevista')).items.some(r=>r.id===reminder.id),false);
 const foreign=await p.businessSubject.create({data:{userId:c.user.id,phoneNumberId:c.account,name:'Entrevista',normalizedName:'entrevista',kind:'project'}});await p.reminder.update({where:{id:reminder.id},data:{subjectId:foreign.id}});
 assert.equal((await retrieveContext(p,c.phone,c.account+'other','entrevista')).items.length,0);
});
test('notas têm origem, versão e exclusão imediata sem índice derivado obsoleto',async()=>{
 const c=await setup(),m=await message(c,'Anota que quero estudar língua inglesa');await p.$transaction(tx=>executeNote(c.phone,c.account,{...base,action:'save_note',description:'Quero estudar língua inglesa.'},tx,m.id));
 const result=await retrieveContext(p,c.phone,c.account,'aprender inglês');assert.equal(result.items[0].kind,'note');assert.equal(result.items[0].sourceMessageId,m.id);
 await p.$transaction(tx=>executeNote(c.phone,c.account,{...base,action:'delete_note',noteId:result.items[0].id,expectedVersion:0},tx,m.id));assert.equal((await retrieveContext(p,c.phone,c.account,'aprender inglês')).items.length,0);
});

test('excluir nota de plano aplicado não reintroduz seu texto pela proposta ou confirmação recente',async()=>{
 const c=await setup(),text='Anota codinome fictício Andorinha e me lembra de revisar amanhã às 10h.';
 const source=await message(c,text,{status:'received'});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>({...base,action:'assistant_plan',planSteps:[{...base,action:'save_note',description:'Codinome fictício Andorinha.'},{...base,action:'create_reminder',title:'Revisar',datetime:'2099-06-02T13:00:00Z'}]})},c.account);await accept(source);
 const confirmed=await message(c,'CONFIRMAR PLANO',{status:'received'});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:()=>assert.fail()},c.account);await accept(confirmed);
 const note=await p.event.findFirstOrThrow({where:{userId:c.user.id,type:'secretary_note'}}),deleted=await message(c,'Apaga a anotação',{status:'received'});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>({...base,action:'delete_note',noteId:note.id})},c.account);await accept(deleted);
 assert.equal(await p.event.count({where:{id:note.id}}),0);const context=await conversationContext(p,{phone:c.phone,phoneNumberId:c.account,text:'O que você lembra?',receivedAt:new Date()});assert.doesNotMatch(JSON.stringify(context),/codinome fictício andorinha/i);
});
test('busca informa truncamento e limita conteúdo enviado ao modelo',async()=>{
 const c=await setup();await p.appointment.createMany({data:Array.from({length:45},(_,i)=>({userId:c.user.id,phoneNumberId:c.account,title:'Entrevista '+i,startsAt:new Date('2099-06-02T17:00:00Z')}))});
 const result=await retrieveContext(p,c.phone,c.account,'entrevista');assert.equal(result.limited,true);assert.equal(result.ambiguous,true);assert.ok(result.items.length<=6);assert.ok(result.items.reduce((sum,r)=>sum+JSON.stringify(r).length,0)<=5000);
});
test('falha de banco/modelo não vira lembrança inventada nem altera o compromisso',async()=>{
 await assert.rejects(retrieveContext({event:{findFirst:async()=>{throw Error('fixture database unavailable');}}},'fixture',account,'emprego'),/database unavailable/);
 const c=await setup(),event=await appointment(c);const m=await message(c,'Como posso me preparar para aquela entrevista?',{status:'received'});await processInboxBatch(p,{buildContext:x=>conversationContext(p,x),interpret:async()=>{throw Error('fixture model unavailable');}},c.account);
 const row=await p.incomingMessage.findUniqueOrThrow({where:{id:m.id}});assert.equal(row.status,'received');assert.equal(await p.replyOutbox.count({where:{messageId:m.id}}),0);assert.equal((await p.appointment.findUniqueOrThrow({where:{id:event.id}})).version,0);
});
