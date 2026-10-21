require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {executeNote,findNotes}=require('../src/domain/notes.ts');
const {executePreferences,setAudioConsent}=require('../src/domain/preferences.ts');
const {persistReminder}=require('../src/domain/reminder.creator.ts');
const {manageReminders}=require('../src/domain/reminder.management.ts');
const {dayOverview}=require('../src/domain/day.overview.ts');
const {conversationContext}=require('../src/domain/conversation.context.ts');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {processInboxBatch}=require('../src/domain/inbox.processor.ts');
const {interpretMessage}=require('../src/services/ai.service.ts');
const {requestContentDeletion,confirmContentDeletion}=require('../src/domain/privacy.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='pilot-v2-'+randomUUID(),otherBiz=biz+'other',phone='5571'+String(Date.now()).slice(-9),otherPhone='5570'+String(Date.now()).slice(-9);
const intent=(action,fields={})=>({action,title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',...fields});
const note=(action,fields={},owner=phone,business=biz)=>p.$transaction(tx=>executeNote(owner,business,intent(action,fields),tx));
const prefs=(fields={},business=biz)=>p.$transaction(tx=>executePreferences(phone,business,intent('set_preferences',fields),tx));
const incoming=(text,extra={})=>p.incomingMessage.create({data:{phoneNumberId:biz,phone,providerMessageId:randomUUID(),text,nextAttemptAt:new Date(0),...extra}});
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,otherPhone]}}});await p.incomingMessage.deleteMany({where:{phoneNumberId:{in:[biz,otherBiz]}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{in:[biz,otherBiz]}}});await p.$disconnect();});
test('nota pode ser corrigida e apagada com versão, isolamento e busca tolerante a pontuação',async()=>{
 await note('save_note',{description:'Orçamento do João: 500 reais.'});
 const found=await findNotes(p,phone,biz,'orçamento de João?');assert.equal(found.length,1);const id=found[0].id;
 const prepared=await prepareConversation({phone,phoneNumberId:biz,text:'corrige essa anotação',receivedAt:new Date()},{buildContext:async()=>({memories:found}),interpret:async()=>intent('edit_note',{noteId:id,description:'Orçamento do João: 650 reais.',expectedVersion:99})});
 assert.equal(prepared.expectedVersion,0);
 assert.match(await p.$transaction(tx=>executeNote(phone,biz,prepared,tx)),/corrigida/);
 assert.match(await note('edit_note',{noteId:id,description:'errado',expectedVersion:0}),/versão atual/);
 assert.match(await note('delete_note',{noteId:id},otherPhone),/Não encontrei/);
 assert.match(await note('delete_note',{noteId:id},phone,otherBiz),/Não encontrei/);
 assert.match(await note('delete_note',{noteId:id,expectedVersion:1}),/mensagens originais/);
 assert.equal((await findNotes(p,phone,biz,'João')).length,0);
});
test('notas ambíguas pedem escolha sem apagar nenhuma',async()=>{
 await note('save_note',{description:'Entrega Alfa: terça'});await note('save_note',{description:'Entrega Beta: sexta'});
 assert.match(await note('delete_note',{search:'Entrega'}),/mais de uma/);assert.equal((await findNotes(p,phone,biz,'Entrega')).length,2);
});
test('perfil é isolado por conta e fuso inválido não persiste parte do pedido',async()=>{
 assert.match(await prefs({displayName:'Não salvar',timezone:'inventado/fuso'}),/Não alterei/);
 assert.equal(await p.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}}),null);
 await prefs({displayName:'Pedro',businessType:'Prestador de serviços',timezone:'America/Manaus'});
 const c=await conversationContext(p,{phone,phoneNumberId:biz,text:'oi',receivedAt:new Date()});assert.equal(c.user.timezone,'America/Manaus');assert.equal(c.user.name,'Pedro');
 const other=await conversationContext(p,{phone,phoneNumberId:otherBiz,text:'oi',receivedAt:new Date()});assert.equal(other.user.timezone,'America/Sao_Paulo');assert.notEqual(other.user.name,'Pedro');
});
test('recorrência, confirmação e consulta respeitam o fuso escolhido e preservam instantes antigos',async()=>{
 const r=await persistReminder({phone,title:'Visitar cliente',remindAt:'2099-06-01T09:00:00-04:00',recurrence:{frequency:'daily',count:2}},p,{phoneNumberId:biz});
 assert.equal(r.scheduleTimezone,'America/Manaus');const series=await p.reminder.findMany({where:{seriesId:r.seriesId},orderBy:{occurrenceIndex:'asc'}});
 assert.deepEqual(series.map(r=>r.remindAt.toISOString()),['2099-06-01T13:00:00.000Z','2099-06-02T13:00:00.000Z']);
 const reply=await p.$transaction(tx=>manageReminders(phone,biz,intent('list_reminders'),tx));assert.match(reply,/09:00/);
 await prefs({timezone:'America/Rio_Branco'});assert.equal((await p.reminder.findUniqueOrThrow({where:{id:r.id}})).remindAt.toISOString(),'2099-06-01T13:00:00.000Z');
 const summary=await p.$transaction(tx=>dayOverview(phone,biz,tx,new Date('2099-06-02T04:00:00Z')));assert.match(summary,/01\/06\/2099/);assert.match(summary,/America\/Rio_Branco/);
});
test('consentimento de áudio não pode ser inferido pela IA e é específico do provedor',async()=>{
 const oldProvider=process.env.AUDIO_TRANSCRIPTION_PROVIDER;process.env.AUDIO_TRANSCRIPTION_PROVIDER='local';
 try{
  assert.match(await prefs({audioConsent:true}),/ACEITO AUDIO/);assert.equal((await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}})).audioConsent,false);
  await p.$transaction(tx=>setAudioConsent(phone,biz,true,tx));let preference=await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}});assert.equal(preference.audioConsentProvider,'local');
  await p.$transaction(tx=>setAudioConsent(phone,biz,false,tx));preference=await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}});assert.equal(preference.audioConsent,false);assert.equal(preference.audioConsentProvider,null);
 }finally{if(oldProvider===undefined)delete process.env.AUDIO_TRANSCRIPTION_PROVIDER;else process.env.AUDIO_TRANSCRIPTION_PROVIDER=oldProvider;}
});
test('uso é persistido antes de JSON inválido e nova tentativa não é feita durante backoff',async()=>{
 const row=await incoming('pedido com retorno inválido');let calls=0;
 const deps={buildContext:async()=>({}),interpret:(c,observer)=>interpretMessage(c,observer,async()=>{calls++;return{provider:'openai',content:'invalid-json',usage:{provider:'openai',model:'fixture-model',inputTokens:200,outputTokens:5,outcome:'completed'}};})};
 await processInboxBatch(p,deps,biz);await processInboxBatch(p,deps,biz);
 const usage=await p.aiUsage.findUniqueOrThrow({where:{messageId_attempt:{messageId:row.id,attempt:1}}});assert.equal(usage.inputTokens,200);assert.equal(usage.outputTokens,5);assert.equal(calls,1);
 const summary=await p.$transaction(tx=>executePreferences(phone,biz,intent('usage_summary'),tx));assert.match(summary,/200 de entrada e 5 de saída/);assert.doesNotMatch(summary,/pedido com retorno/);
 await p.incomingMessage.delete({where:{id:row.id}});
});
test('falha de medição não repete chamada nem bloqueia resposta válida',async()=>{
 const row=await incoming('pedido válido'),store={incomingMessage:p.incomingMessage,$transaction:p.$transaction.bind(p),aiUsage:{upsert:args=>p.aiUsage.upsert(args),update:async()=>{throw Error('falha simulada');}}};let calls=0;
 await processInboxBatch(store,{buildContext:async()=>({}),interpret:(c,observer)=>interpretMessage(c,observer,async()=>{calls++;return{provider:'openai',content:JSON.stringify(intent('conversation',{reply:'Tudo certo'})),usage:{provider:'openai',inputTokens:2,outputTokens:3,outcome:'completed'}};})},biz);
 assert.equal(calls,1);assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}})).reply.text,'Tudo certo');assert.equal((await p.aiUsage.findUniqueOrThrow({where:{messageId_attempt:{messageId:row.id,attempt:1}}})).outcome,'started');
});
test('limpeza requer confirmação, recusa envio incerto e reverte integralmente se houver falha',async()=>{
 await note('save_note',{description:'SEGREDO de outra conta'},phone,otherBiz);
 const original=await incoming('CONTEÚDO pessoal original',{status:'completed'}),task=await persistReminder({phone,title:'Tarefa pessoal',remindAt:'2099-06-02T13:00:00Z'},p,{phoneNumberId:biz,sourceMessageId:original.id});
 const request=await p.$transaction(tx=>requestContentDeletion(phone,biz,tx)),token=request.match(/CONFIRMAR EXCLUSAO ([A-F0-9]{8})/)[1];
 const confirmation=await incoming('CONFIRMAR EXCLUSAO '+token);
 assert.match(await p.$transaction(tx=>confirmContentDeletion(phone,otherBiz,tx,confirmation)),/não há|Não há|expirou/);
 await p.reminder.update({where:{id:task.id},data:{status:'delivery_unknown'}});
 assert.match(await p.$transaction(tx=>confirmContentDeletion(phone,biz,tx,confirmation)),/Não apaguei/);assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:original.id}})).text,'CONTEÚDO pessoal original');
 await p.reminder.update({where:{id:task.id},data:{status:'scheduled'}});
 await assert.rejects(p.$transaction(tx=>confirmContentDeletion(phone,biz,new Proxy(tx,{get(t,k){if(k==='aiUsage')return{deleteMany:async()=>{throw Error('rollback fixture');}};return t[k];}}),confirmation)),/rollback fixture/);
 assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:original.id}})).text,'CONTEÚDO pessoal original');assert.ok(await p.reminder.findUnique({where:{id:task.id}}));
 const deps={buildContext:()=>assert.fail('Comando de privacidade não usa IA'),interpret:()=>assert.fail()};await processInboxBatch(p,deps,biz);
 const saved=await p.incomingMessage.findUniqueOrThrow({where:{id:confirmation.id},include:{reply:true}});assert.match(saved.reply.text,/Limpei o conteúdo/);
 assert.equal((await p.incomingMessage.findUniqueOrThrow({where:{id:original.id}})).text,'[conteúdo removido]');assert.equal(await p.reminder.count({where:{user:{phone},scheduleOutbox:{phoneNumberId:biz}}}),0);
 assert.equal((await findNotes(p,phone,otherBiz,'SEGREDO')).length,1);assert.equal((await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:biz,phone}}})).remindersPaused,true);
 assert.equal(await p.aiUsage.count({where:{message:{phone,phoneNumberId:biz}}}),0);
});
