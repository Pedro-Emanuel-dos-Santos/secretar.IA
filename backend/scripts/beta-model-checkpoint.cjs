// Current credentials must be supplied explicitly. Never loads .env or sends
// WhatsApp. One call, no SDK retries, bound to the exact fictional context hash.
const {createHash}=require('node:crypto');
const {createLedger}=require('./lib/context-memory-evaluation.cjs');
function createCheckpointLock(destination,metadata){const fs=require('node:fs'),lock=destination+'.lock',fd=fs.openSync(lock,'wx');try{fs.writeSync(fd,JSON.stringify(metadata));}finally{fs.closeSync(fd);}return lock;}
async function evaluateCheckpoint({fixture,model,spentUsd,budgetUsd=.1,estimateAICost,request}){
 if(!fixture||fixture.fictional!==true||!['plan','correction'].includes(fixture.label))throw Error('Fictional checkpoint required');
 const hash=createHash('sha256').update(JSON.stringify({prompt:fixture.prompt,context:fixture.context})).digest('hex');
 if(hash!==fixture.requestSha256)throw Error('Checkpoint hash mismatch');
 if(!['gpt-4.1-mini','gpt-4.1-mini-2025-04-14'].includes(model))throw Error('Unpriced model');
 if(!Number.isFinite(spentUsd))throw Error('Explicit cumulative spending required');
 const ledger=createLedger(budgetUsd,spentUsd),upper=estimateAICost({provider:'openai',model,inputTokens:Buffer.byteLength(fixture.prompt+JSON.stringify(fixture.context))+2000,cachedInputTokens:0,outputTokens:1200}).estimatedCostUsd;
 ledger.reserve(upper);const started=Date.now();
 try{
  const response=await request({model,input:[{role:'system',content:fixture.prompt},{role:'user',content:JSON.stringify(fixture.context)}],store:false,temperature:.2,max_output_tokens:1200,text:{format:{type:'json_object'}}});
  const cost=estimateAICost({provider:'openai',model:response.model,inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens,cachedInputTokens:response.usage?.input_tokens_details?.cached_tokens});ledger.settle(upper,cost.estimatedCostUsd);
  return {requestSha256:hash,requestedModel:model,model:response.model,status:response.status,output_text:response.output_text,usage:response.usage,latencyMs:Date.now()-started,estimatedCostUsd:cost.estimatedCostUsd??null,budget:ledger.snapshot()};
 }catch{ledger.block();return {error:'provider_failure_usage_unknown',budget:ledger.snapshot()};}
}
async function main(){
 const fs=require('node:fs'),path=require('node:path'),label=process.argv[2],root=process.env.BETA_ARTIFACT_DIR;
 if(!root||!['plan','correction'].includes(label))throw Error('BETA_ARTIFACT_DIR and plan/correction required');
 const fixture=JSON.parse(fs.readFileSync(path.join(root,label+'-request.json'),'utf8'));
 if(!process.argv.includes('--allow-provider')){console.log(JSON.stringify({mode:'dry-run',label,fictional:fixture.fictional,providerCalls:0,requires:'--allow-provider --spent-usd=TOTAL_PREVIOUS_SPENDING; current OPENAI_API_KEY and OPENAI_MODEL'}));return;}
 const destination=path.join(root,label+'-response.json');if(fs.existsSync(destination))throw Error('Existing response preserved: do not bill the same checkpoint twice');
 const spentUsd=Number(process.argv.find(x=>x.startsWith('--spent-usd='))?.split('=')[1]);
 if(!process.env.OPENAI_API_KEY)throw Error('Current environment credential required; .env is not loaded');
 const lock=createCheckpointLock(destination,{requestSha256:fixture.requestSha256,spentUsd});
 const OpenAI=require('openai'),client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:28000,maxRetries:0});
 const {estimateAICost}=require('../dist/domain/ai.cost');
 const result=await evaluateCheckpoint({fixture,model:process.env.OPENAI_MODEL,spentUsd,estimateAICost,request:body=>client.responses.create(body)});
 fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});if(!result.error&&!result.budget.blocked)fs.unlinkSync(lock);console.log(JSON.stringify({label,model:result.model,budget:result.budget,error:result.error||null}));if(result.error||result.budget.blocked)process.exitCode=1;
}
module.exports={evaluateCheckpoint,createCheckpointLock};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
