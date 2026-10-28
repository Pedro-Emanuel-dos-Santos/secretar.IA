// Fictional interpretations only: no .env, database, executor, queue or WhatsApp.
const {cases,runEvaluation}=require('./lib/context-memory-evaluation.cjs');
async function main(){
 if(!process.argv.includes('--allow-provider')){
  console.log(JSON.stringify({evaluation:'context-memory',mode:'dry-run',cases:cases.map(x=>x.id),providerCalls:0,databaseWrites:0,whatsappSends:0,requires:'--allow-provider --budget-usd=0.10; current OPENAI_API_KEY; --spent-usd carries ALL prior rounds. Estimate, not a provider billing cap.'}));return;
 }
 const arg=name=>Number(process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=')[1]);
 const budgetUsd=arg('budget-usd'),spentUsd=process.argv.some(x=>x.startsWith('--spent-usd='))?arg('spent-usd'):0;
 const caseIds=process.argv.find(x=>x.startsWith('--cases='))?.slice('--cases='.length).split(',');
 if(!process.env.OPENAI_API_KEY)throw Error('Supply a current OPENAI_API_KEY; .env is intentionally not loaded.');
 const OpenAI=require('openai');
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:28000,maxRetries:0});
 const {secretaryPrompt}=require('../dist/prompts/secretary.prompt');
 const {prepareConversation}=require('../dist/domain/conversation.processor');
 const {parseInterpretation}=require('../dist/domain/interpretation.validation');
 const {estimateAICost,pricingVersion}=require('../dist/domain/ai.cost');
 const result=await runEvaluation({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',budgetUsd,spentUsd,caseIds,secretaryPrompt,prepareConversation,parseInterpretation,estimateAICost,pricingVersion,request:body=>client.responses.create(body),emit:row=>console.log(JSON.stringify(row))});
 if(result.passed!==result.total||result.stopped)process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.log(JSON.stringify({evaluation:'context-memory',error:'evaluation_configuration_or_runtime_failure'}));process.exitCode=1;});
