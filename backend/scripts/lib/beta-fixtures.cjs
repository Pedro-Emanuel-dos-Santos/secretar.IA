// Development-only fixtures. All outbound networking is blocked except the
// loopback HTTP webhook. Real model responses enter through an audited file.
require('../../test/register.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID,createHmac,createHash}=require('node:crypto');
const databaseUrl=process.env.INBOX_TEST_DATABASE_URL,redisUrl=process.env.BETA_TEST_REDIS_URL;
function localTarget(value,kind){const u=new URL(value);if(u.hostname!=='127.0.0.1'||(kind==='db'?!u.pathname.endsWith('_test')||u.port!=='5435':u.port!=='6381'))throw Error('Only dedicated local M04 test services are allowed');return u;}
localTarget(databaseUrl,'db');const redisTarget=localTarget(redisUrl,'redis');
process.env.AI_MODE='openai';delete process.env.OPENAI_API_KEY;delete process.env.WHATSAPP_ACCESS_TOKEN;
global.fetch=async()=>{throw Error('Real HTTP transport disabled in beta fixtures');};
const {createPrismaClient}=require('../../src/config/database.ts');
const {conversationContext}=require('../../src/domain/conversation.context.ts');
const {processInboxBatch}=require('../../src/domain/inbox.processor.ts');
const {interpretMessage}=require('../../src/services/ai.service.ts');
const {aiRouter}=require('../../src/ai/ai-router.ts');
const {secretaryPrompt}=require('../../src/prompts/secretary.prompt.ts');
const {relayReplies}=require('../../src/domain/reply.relay.ts');
const {createWhatsAppSender}=require('../../src/services/whatsapp.sender.ts');
const {createWebhookRouter}=require('../../src/http/webhook.handlers.ts');
const {receiveDeliveryReceipts,reconcileStoredDelivery}=require('../../src/domain/delivery.receipts.ts');
const express=require('express');
const root=path.resolve(process.env.BETA_ARTIFACT_DIR||'');if(!process.env.BETA_ARTIFACT_DIR)throw Error('BETA_ARTIFACT_DIR required');fs.mkdirSync(root,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(data,null,2)+'\n');
const load=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const sha=data=>createHash('sha256').update(Buffer.isBuffer(data)||typeof data==='string'?data:JSON.stringify(data)).digest('hex');
const p=createPrismaClient(databaseUrl),connection={host:'127.0.0.1',port:Number(redisTarget.port),db:15,maxRetriesPerRequest:null};
async function harness(state){
 const last=await p.incomingMessage.aggregate({where:{phoneNumberId:state.account},_max:{receivedAt:true}});
 if(last._max.receivedAt)state.sequence=Math.max(state.sequence,Math.floor((last._max.receivedAt.getTime()-Date.parse('2099-06-01T12:00:00Z'))/1000));
 const sent=[],env={WHATSAPP_PHONE_NUMBER_ID:state.account,WHATSAPP_ACCESS_TOKEN:'fictional-never-transmitted',WHATSAPP_BUSINESS_ACCOUNT_ID:'100000000000000',WHATSAPP_REMINDER_TEMPLATE_NAME:'fixture_reminder',WHATSAPP_REMINDER_TEMPLATE_LANGUAGE:'pt_BR',WHATSAPP_REMINDER_TEMPLATE_APPROVED:'true'};
 const transport=async(url,options={})=>{
  assert.ok(url.startsWith('https://graph.facebook.com/'));
  if(!options.method||options.method==='GET')return new Response(JSON.stringify({data:[{name:'fixture_reminder',language:'pt_BR',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Lembrete: {{1}}'}]}]}));
  assert.equal(options.method,'POST');assert.ok(url.endsWith('/'+state.account+'/messages'));
  const id='wamid.fixture.'+randomUUID();sent.push({id,payload:JSON.parse(options.body)});return new Response(JSON.stringify({messages:[{id}]}));
 };
 const sender=createWhatsAppSender(p,env,transport,()=>Date.parse('2099-06-01T12:00:00Z')+(state.sequence+1)*1000);
 const reminderSender=createWhatsAppSender(p,env,transport,()=>Date.parse('2099-06-04T12:00:00Z'));
 const app=express();app.use(createWebhookRouter(p.incomingMessage,()=>({appSecret:'fictional-hmac',phoneNumberId:state.account}),payload=>receiveDeliveryReceipts(payload,state.account,p)));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 async function webhook(payload,valid=true){const bytes=Buffer.from(JSON.stringify(payload)),signature=createHmac('sha256','fictional-hmac').update(bytes).digest('hex');return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/webhook',method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'x-hub-signature-256':'sha256='+(valid?signature:'invalid')}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(bytes);});}
 async function receive(text,options={}){
  const id=options.providerId||'fixture.'+randomUUID(),phone=options.phone||state.phone;
  const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:state.account},messages:[{id,from:phone,type:'text',text:{body:text}}]}}]}]};
  assert.equal(await webhook(payload,options.valid!==false),options.valid===false?401:200);
  if(options.valid===false)return null;
  const row=await p.incomingMessage.findUniqueOrThrow({where:{phoneNumberId_providerMessageId:{phoneNumberId:state.account,providerMessageId:id}}});
  if(row.status==='received')await p.incomingMessage.update({where:{id:row.id},data:{receivedAt:new Date(Date.parse('2099-06-01T12:00:00Z')+(++state.sequence)*1000)}});
  save('state',state);
  return p.incomingMessage.findUniqueOrThrow({where:{id:row.id}});
 }
 async function process(fixtureIntent){await processInboxBatch(p,{buildContext:m=>conversationContext(p,m),interpret:async()=>{if(!fixtureIntent)assert.fail('Unexpected model call');return fixtureIntent;}},state.account);}
 async function deliver(){return relayReplies(p,(phone,text)=>sender(phone,text,'reply'),state.account,id=>reconcileStoredDelivery(p,state.account,id));}
 async function receipt(id,phone=state.phone,status='delivered'){
  assert.equal(await webhook({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:state.account},statuses:[{id,recipient_id:phone,status,timestamp:'4073500800'}]}}]}]}),200);
 }
 return {receive,process,deliver,receipt,sent,sender,reminderSender,close:()=>new Promise(resolve=>server.close(resolve))};
}
const base={reply:'fixture: no execution claimed',title:null,description:null,datetime:null,amount:null,category:null};
async function prepareRequest(state,message,label){
 const context=JSON.parse(JSON.stringify(await conversationContext(p,message)));
 const request={label,fictional:true,messageId:message.id,context,prompt:secretaryPrompt};request.requestSha256=sha({prompt:request.prompt,context});save(label+'-request',request);save('state',state);return request;
}
async function resumeRequest(state,label){
 const req=load(label+'-request'),response=load(label+'-response');assert.equal(response.requestSha256,req.requestSha256);
 const message=await p.incomingMessage.findUniqueOrThrow({where:{id:req.messageId}}),fresh=JSON.parse(JSON.stringify(await conversationContext(p,message)));
 const comparable=c=>{const {processingAt,...rest}=c;return rest;};assert.deepEqual(comparable(fresh),comparable(req.context),'Context changed while evaluating; re-evaluate rather than use stale output');
 assert.equal(response.status,'completed');assert.equal(response.model,'gpt-4.1-mini-2025-04-14');
 const usage={provider:'openai',model:response.model,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cachedInputTokens:response.usage.input_tokens_details.cached_tokens,outcome:'completed'};
 await processInboxBatch(p,{buildContext:async()=>req.context,interpret:(ctx,onUsage)=>interpretMessage(ctx,onUsage,input=>aiRouter(input,{env:{AI_MODE:'openai',OPENAI_MODEL:'gpt-4.1-mini'},openai:async()=>({provider:'openai',content:response.output_text,usage})}))},state.account);
 const result=await p.incomingMessage.findUniqueOrThrow({where:{id:message.id},include:{reply:true}});assert.equal(result.status,'reply_pending');assert.ok(result.reply);
 const storedUsage=await p.aiUsage.findFirstOrThrow({where:{messageId:message.id}});assert.equal(storedUsage.inputTokens,usage.inputTokens);assert.equal(storedUsage.costStatus,'estimated');save(label+'-persisted',{incoming:result,usage:storedUsage});return result;
}
module.exports={assert,fs,path,randomUUID,p,connection,root,save,load,sha,harness,base,prepareRequest,resumeRequest,createPrismaClient,databaseUrl};
