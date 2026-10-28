require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWhatsAppSender}=require('../src/services/whatsapp.sender.ts');
const {verifiedTemplate,verifyReminderTemplate}=require('../src/services/whatsapp-template.service.ts');
const {WhatsAppPreflightError}=require('../src/domain/whatsapp.policy.ts');
const {WhatsAppSendNotAttempted,WhatsAppSendRejected,providerRejection,retryableRejection}=require('../src/domain/whatsapp.errors.ts');
const env={WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_ACCESS_TOKEN:'fixture-secret',WHATSAPP_BUSINESS_ACCOUNT_ID:'456',WHATSAPP_REMINDER_TEMPLATE_NAME:'secretaria_lembrete_v1',WHATSAPP_REMINDER_TEMPLATE_LANGUAGE:'pt_BR',WHATSAPP_REMINDER_TEMPLATE_APPROVED:'true'};
const template={name:env.WHATSAPP_REMINDER_TEMPLATE_NAME,language:'pt_BR',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Seu lembrete: {{1}}'}]};
const body=()=>({data:[template]});
const store=(date=null,paused=false)=>({incomingMessage:{findFirst:async()=>date?{receivedAt:date}:null},contactPreference:{findUnique:async()=>({remindersPaused:paused})}});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
test('fora da janela verifica aprovação, idioma e formato antes de enviar template',async()=>{
 const calls=[];const send=createWhatsAppSender(store(),env,async(url,opts)=>{calls.push({url,opts});return calls.length===1?json(body()):json({messages:[{id:'wamid.fixture'}]});});
 const result=await send('5511999990000','⏰ Lembrete: água','reminder');assert.equal(result.messages[0].id,'wamid.fixture');assert.equal(calls.length,2);assert.match(calls[0].url,/456\/message_templates/);const sent=JSON.parse(calls[1].opts.body);assert.equal(sent.type,'template');assert.equal(sent.template.name,template.name);assert.equal(sent.template.components[0].parameters[0].text,'⏰ Lembrete: água');
});
test('template pausado, idioma errado, layout incompatível ou configuração incompleta não enviam mensagem',async()=>{
 for(const row of [{...template,status:'PAUSED'},{...template,language:'en_US'},{...template,components:[{type:'BODY',text:'{{1}} {{2}}'}]},{...template,category:'MARKETING'},{...template,parameter_format:'NAMED'},{...template,components:[...template.components,{type:'HEADER',text:'{{1}}'}]}]){
  let calls=0;await assert.rejects(createWhatsAppSender(store(),env,async()=>{calls++;return json({data:[row]});})('5511999990000','private','reminder'),WhatsAppPreflightError);assert.equal(calls,1);
 }
 for(const field of ['WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_REMINDER_TEMPLATE_NAME','WHATSAPP_REMINDER_TEMPLATE_APPROVED'])await assert.rejects(verifyReminderTemplate({...env,[field]:''},()=>assert.fail()),WhatsAppPreflightError);
 assert.throws(()=>verifiedTemplate({data:[template,template]},template.name,'pt_BR'),WhatsAppPreflightError);
});
test('janela aberta evita GET e usa texto; pausa bloqueia todos os HTTP',async()=>{
 const now=Date.now();let calls=0;
 await createWhatsAppSender(store(new Date(now-60000)),env,async(url,opts)=>{calls++;assert.equal(JSON.parse(opts.body).type,'text');return json({messages:[{id:'x'}]});},()=>now)('5511999990000','aviso','reminder');assert.equal(calls,1);
 await assert.rejects(createWhatsAppSender(store(null,true),env,()=>assert.fail())('5511999990000','aviso','reminder'),WhatsAppPreflightError);
});
test('rejeição confirmada 131047 faz uma única transição de texto para template verificado',async()=>{
 const calls=[];await createWhatsAppSender(store(new Date()),env,async(url,opts)=>{calls.push(opts?.body?JSON.parse(opts.body).type:'verify');return calls.length===1?json({error:{code:131047}},400):calls.length===2?json(body()):json({messages:[{id:'x'}]});})('5511999990000','aviso','reminder');assert.deepEqual(calls,['text','verify','template']);
});
test('falha de verificação antes do POST é segura para retry; timeout do POST permanece incerto',async()=>{
 for(const status of [429,503])await assert.rejects(verifyReminderTemplate(env,async()=>json({},status)),WhatsAppSendNotAttempted);
 await assert.rejects(verifyReminderTemplate(env,async()=>{throw Error('network');}),WhatsAppSendNotAttempted);
 let calls=0;await assert.rejects(createWhatsAppSender(store(),env,async()=>{calls++;if(calls===1)return json(body());throw Error('ambiguous timeout');})('5511999990000','aviso','reminder'),/ambiguous timeout/);assert.equal(calls,2);
});
test('429 estruturado preserva Retry-After, rejeições permanentes e respostas ambíguas não permitem retry',async()=>{
 await assert.rejects(createWhatsAppSender(store(new Date()),env,async()=>json({error:{code:130429}},400,{'retry-after':'120'}))('5511999990000','aviso','reminder'),e=>e instanceof WhatsAppSendRejected && e.retryAfterMs===120000 && retryableRejection(e));
 assert.equal(retryableRejection(new WhatsAppSendRejected(400,131048)),false);assert.equal(retryableRejection(new WhatsAppSendRejected(401,190)),false);assert.equal(providerRejection(503,{error:{code:1}}),null);assert.equal(providerRejection(429,{messages:[{id:'accepted'}],error:{code:130429}}),null);
});
test('origem Meta fixa impede envio de credenciais para endpoint arbitrário',async()=>{
 await assert.rejects(verifyReminderTemplate({...env,WHATSAPP_API_URL:'https://example.org'},()=>assert.fail()),WhatsAppPreflightError);
 await assert.rejects(createWhatsAppSender(store(),{...env,WHATSAPP_API_URL:'https://example.org'},()=>assert.fail())('5511999990000','aviso','reminder'),e=>e instanceof WhatsAppPreflightError && e.reason==='sender_not_configured');
});
