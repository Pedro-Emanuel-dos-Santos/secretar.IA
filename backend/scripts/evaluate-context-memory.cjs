// Fictional contexts and interpretation only. No Prisma, executor, queue or WhatsApp.
// No .env loading: supply a current provider credential explicitly in the environment.
const cases=[
 {id:'old_employment',text:'Você lembra da área em que estou procurando trabalho?',actions:['recall_context'],items:[{id:'fixture-goal',kind:'personal',category:'goal',title:'Carreira',text:'Busco emprego em desenvolvimento de software.',recordedAt:'2026-10-10T12:00:00Z',updatedAt:'2026-10-10T12:00:00Z',sourceMessageId:'fixture-source',version:0}]},
 {id:'interview_advice',text:'Como posso me preparar para aquela entrevista?',actions:['conversation'],items:[{id:'fixture-interview',kind:'appointment',title:'Entrevista técnica',text:'Entrevista técnica para desenvolvimento de software.',startsAt:'2026-10-30T13:00:00Z',recordedAt:'2026-10-15T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z',sourceMessageId:'fixture-source',version:0}]},
 {id:'ambiguous_interview',text:'Como posso me preparar para aquela entrevista?',actions:['conversation'],ambiguous:true,items:[{id:'a',kind:'appointment',title:'Entrevista Alfa',text:'Entrevista Alfa'},{id:'b',kind:'appointment',title:'Entrevista Beta',text:'Entrevista Beta'}]},
 {id:'current_correction',text:'Na verdade, mudou para as 16h.',actions:['reschedule_appointment'],focused:true,items:[]},
 {id:'correction_without_focus',text:'Na verdade, mudou para as 16h.',actions:['conversation'],items:[]},
 {id:'multiple_requests',text:'Anota que preciso do portfólio e me lembra de revisar o portfólio amanhã às 10h. Quero revisar o conjunto.',actions:['assistant_plan'],steps:['save_note','create_reminder'],items:[]},
 {id:'preference',text:'Qual horário eu prefiro para reuniões?',actions:['recall_context'],items:[{id:'fixture-preference',kind:'personal',category:'preference',title:'Horário de reunião',text:'Prefiro reuniões pela manhã.',recordedAt:'2026-10-12T12:00:00Z',updatedAt:'2026-10-12T12:00:00Z',sourceMessageId:'fixture-source',version:1}]},
 {id:'storage_opt_out',text:'Estou buscando emprego. Não guarde isso como memória ou anotação.',actions:['conversation'],items:[]},
];
const allow=process.argv.includes('--allow-provider');
if(!allow){console.log(JSON.stringify({evaluation:'context-memory',mode:'dry-run',cases:cases.map(x=>x.id),providerCalls:0,databaseWrites:0,whatsappSends:0,requires:'--allow-provider --budget-usd=0.10 (current OPENAI_API_KEY, supported model; estimate, not provider billing cap)'}));process.exit(0);}
const budget=Number(process.argv.find(x=>x.startsWith('--budget-usd='))?.split('=')[1]);
if(!Number.isFinite(budget)||budget<=0||budget>0.25)throw Error('Supply an estimated budget >0 and <=0.25 USD.');
if(!process.env.OPENAI_API_KEY)throw Error('Supply a current OPENAI_API_KEY; this script does not load .env.');
const model=process.env.OPENAI_MODEL || 'gpt-4.1-mini';
if(!['gpt-4.1-mini','gpt-4.1-mini-2025-04-14'].includes(model))throw Error('Unknown price for configured model; evaluation stopped.');
const OpenAI=require('openai'),{secretaryPrompt}=require('../dist/prompts/secretary.prompt'),{prepareConversation}=require('../dist/domain/conversation.processor'),{parseInterpretation}=require('../dist/domain/interpretation.validation'),{estimateAICost,pricingVersion}=require('../dist/domain/ai.cost');
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:20000,maxRetries:0});
async function main(){let reserved=0,calls=0,passed=0,unknownUsage=false;
 for(const item of cases){
  const appointment={id:'fixture-meeting',title:'Reunião',state:'active',startsAt:'2026-10-30T17:00:00Z',endsAt:'2026-10-30T18:00:00Z',version:3};
  const ctx={now:'2026-10-28T12:00:00Z',user:{name:'Pessoa fictícia',timezone:'America/Sao_Paulo'},currentMessage:item.text,personalMemoryEnabled:true,personalMemories:[],memories:[],reminders:[],appointments:item.focused?[appointment]:[],subjects:[],lastMessages:[],contextualMemory:{method:'concepts-lexical-v1',items:item.items,ambiguous:!!item.ambiguous,limited:false},conversationState:{focusedAppointment:item.focused?appointment:null}};
  try{
   const intent=await prepareConversation({phone:'fixture',phoneNumberId:'fixture',text:item.text,receivedAt:new Date(ctx.now)},{buildContext:async()=>ctx,interpret:async context=>{
    if(unknownUsage)throw Error('usage_unknown_stop');
    // Conservative UTF-8 byte bound plus 2k framing allowance; no cached discount.
    const upper=estimateAICost({provider:'openai',model,inputTokens:Buffer.byteLength(secretaryPrompt+JSON.stringify(context))+2000,cachedInputTokens:0,outputTokens:1200,outcome:'completed'}).estimatedCostUsd;
    if(reserved+upper>budget)throw Error('budget_stop');reserved+=upper;calls++;
    const response=await client.responses.create({model,input:[{role:'system',content:secretaryPrompt},{role:'user',content:JSON.stringify(context)}],temperature:0.2,max_output_tokens:1200,store:false,text:{format:{type:'json_object'}}});
    if(!response.usage)unknownUsage=true;
    return parseInterpretation(response.output_text);
   }});
   const issues=[];if(!item.actions.includes(intent.action))issues.push('action');
   if(item.steps && JSON.stringify((intent.planSteps || []).map(s=>s.action).sort())!==JSON.stringify(item.steps.slice().sort()))issues.push('steps');
   if(item.id==='current_correction' && (intent.appointmentId!==appointment.id || intent.expectedVersion!==3 || Date.parse(intent.datetime)!==Date.parse('2026-10-30T19:00:00Z')))issues.push('correction_state');
   if(item.id==='ambiguous_interview' && !/qual|alfa|beta|especific|mais de uma/i.test(intent.reply))issues.push('ambiguity');
   if(item.id==='interview_advice' && /anotei|agendei|marquei|criei/i.test(intent.reply))issues.push('false_execution');
   if(!issues.length)passed++;console.log(JSON.stringify({id:item.id,passed:!issues.length,action:intent.action,issues}));
  }catch(error){console.log(JSON.stringify({id:item.id,passed:false,error:['budget_stop','usage_unknown_stop'].includes(error.message)?error.message:'provider_or_validation',status:error.status || null}));break;}
 }
 console.log(JSON.stringify({evaluation:'context-memory',model,pricingVersion,passed,total:cases.length,providerCalls:calls,reservedUpperEstimateUsd:reserved,budgetUsd:budget,unknownUsage,databaseWrites:0,whatsappSends:0,note:'Estimated guard, not an account billing limit; deterministic guards included. Does not prove retrieval or real actions.'}));if(passed!==cases.length || unknownUsage)process.exitCode=1;
}
main().catch(()=>{console.log('EVALUATION_FAILED');process.exitCode=1;});
