// Dependency-injected: no environment, file, network or database access here.
const cases=[
 {id:'old_employment',text:'Você lembra da área em que estou procurando trabalho?',action:'recall_context',expected:'Consultar memória autorizada de desenvolvimento de software; não inventar emprego.',items:[{id:'fixture-goal',kind:'personal',category:'goal',title:'Carreira',text:'Busco emprego em desenvolvimento de software.',recordedAt:'2026-10-10T12:00:00Z',updatedAt:'2026-10-10T12:00:00Z',sourceMessageId:'fixture-source',version:0}]},
 {id:'interview_advice',text:'Como posso me preparar para aquela entrevista?',action:'conversation',expected:'Conselho contextual sobre entrevista técnica de software, sem afirmar execução.',items:[{id:'fixture-interview',kind:'appointment',title:'Entrevista técnica',text:'Entrevista técnica para desenvolvimento de software.',startsAt:'2026-10-30T13:00:00Z',recordedAt:'2026-10-15T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z',sourceMessageId:'fixture-source',version:0}]},
 {id:'ambiguous_interview',text:'Como posso me preparar para aquela entrevista?',action:'conversation',expected:'Perguntar qual entrevista (Alfa ou Beta), sem escolher silenciosamente.',ambiguous:true,items:[{id:'a',kind:'appointment',title:'Entrevista Alfa',text:'Entrevista Alfa'},{id:'b',kind:'appointment',title:'Entrevista Beta',text:'Entrevista Beta'}]},
 {id:'current_correction',text:'Na verdade, mudou para as 16h.',action:'reschedule_appointment',expected:'Reunião fixture-meeting, versão 3, 30/10/2026 16h São Paulo (19Z); preservar dia.',focused:true,items:[]},
 {id:'correction_without_focus',text:'Na verdade, mudou para as 16h.',action:'conversation',expected:'Pedir identificação do registro; não criar nem escolher compromisso sem foco.',items:[]},
 {id:'multiple_requests',text:'Anota que preciso do portfólio e me lembra de revisar o portfólio amanhã às 10h. Quero revisar o conjunto.',action:'assistant_plan',expected:'Proposta com exatamente save_note (portfólio) e create_reminder (revisar portfólio, 29/10/2026 10h São Paulo=13Z); sem afirmar execução.',items:[]},
 {id:'preference',text:'Qual horário eu prefiro para reuniões?',action:'recall_context',expected:'Consultar preferência registrada de reuniões pela manhã, sem alterar preferência.',items:[{id:'fixture-preference',kind:'personal',category:'preference',title:'Horário de reunião',text:'Prefiro reuniões pela manhã.',recordedAt:'2026-10-12T12:00:00Z',updatedAt:'2026-10-12T12:00:00Z',sourceMessageId:'fixture-source',version:1}]},
 {id:'storage_opt_out',text:'Estou buscando emprego. Não guarde isso como memória ou anotação.',action:'conversation',expected:'Conversar sem salvar nota, fato, memória ou plano; respeitar recusa explícita.',items:[]},
];
const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function fixtureContext(item){
 const appointment={id:'fixture-meeting',title:'Reunião',state:'active',startsAt:'2026-10-30T17:00:00Z',endsAt:'2026-10-30T18:00:00Z',version:3};
 return {now:'2026-10-28T12:00:00Z',user:{name:'Pessoa fictícia',timezone:'America/Sao_Paulo'},currentMessage:item.text,personalMemoryEnabled:true,personalMemories:[],memories:[],reminders:[],appointments:item.focused?[appointment]:[],subjects:[],lastMessages:[],contextualMemory:{method:'concepts-lexical-v1',items:structuredClone(item.items),ambiguous:!!item.ambiguous,limited:false},conversationState:{focusedAppointment:item.focused?appointment:null}};
}
function checkInterpretation(item,intent,{guarded=false}={}){
 const issues=[];
 if(!intent||intent.action!==item.action)issues.push('action');
 if(!intent)return issues;
 const reply=norm(intent.reply);
 const executed='anotei|agendei|marquei|criei|salvei|registrei|reagendei|alterei|atualizei|cancelei|conclui';
 const claims=reply.replace(new RegExp(`\\bnao (?:${executed})\\b`,'g'),'');
 if(new RegExp(`\\b(?:${executed})\\b`).test(claims))issues.push('false_execution');
 if(['old_employment','preference'].includes(item.id)&&(!intent.search||!new RegExp(item.id==='preference'?'horario|reunio|pref':'area|trabalho|emprego|carreira|software|desenvolv').test(norm(intent.search))))issues.push('lookup_query');
 if(item.id==='interview_advice'&&!/tecnic|software|programa|desenvolv|codigo/.test(reply))issues.push('missing_context');
 if(item.id==='interview_advice'&&!/\b(?:revise|pratique|prepare|treine|estude|recomendo|sugiro|comece|explique|releia)\b/.test(reply))issues.push('missing_actionable_advice');
 if(item.id==='ambiguous_interview'&&(!reply.includes('?')||!/qual|especific|alfa ou beta|alfa e beta/.test(reply)))issues.push('ambiguity');
 if(item.id==='current_correction'&&(intent.appointmentId!=='fixture-meeting'||Date.parse(intent.datetime)!==Date.parse('2026-10-30T19:00:00Z')||(guarded&&intent.expectedVersion!==3)))issues.push('correction_state');
 if(item.id==='correction_without_focus'&&(!reply.includes('?')||!/qual|identific|tarefa|compromisso|reuniao/.test(reply)))issues.push('missing_target_question');
 if(item.id==='multiple_requests'){
  const steps=intent.planSteps||[],note=steps.find(s=>s.action==='save_note'),reminder=steps.find(s=>s.action==='create_reminder');
  if(steps.length!==2||!note||!reminder)issues.push('steps');
  if(!/portfolio/.test(norm(note?.description)))issues.push('note_content');
  if(!/revis/.test(norm(reminder?.title))||!/portfolio/.test(norm(reminder?.title))||Date.parse(reminder?.datetime)!==Date.parse('2026-10-29T13:00:00Z'))issues.push('reminder_content_or_time');
 }
 return [...new Set(issues)];
}
function createLedger(budgetUsd,spentUsd=0){
 if(!Number.isFinite(budgetUsd)||budgetUsd<=0||budgetUsd>0.10||!Number.isFinite(spentUsd)||spentUsd<0||spentUsd>budgetUsd)throw Error('invalid_budget');
 let total=spentUsd,held=0,blocked=false;
 return {
  reserve(upper){if(blocked||!Number.isFinite(upper)||upper<0||total+held+upper>budgetUsd)throw Error('budget_stop');held+=upper;},
  settle(upper,cost){if(!Number.isFinite(cost)||cost<0){blocked=true;return false;}held-=upper;total+=cost;if(cost>upper||total>budgetUsd){blocked=true;return false;}return true;},
  block(){blocked=true;},snapshot(){return {budgetUsd,priorSpentUsd:spentUsd,estimatedCostUsd:Number((total-spentUsd).toFixed(12)),cumulativeEstimatedCostUsd:Number(total.toFixed(12)),uncertainReservedUsd:Number(held.toFixed(12)),blocked};}
 };
}
async function runEvaluation(options){
 const {model,budgetUsd,spentUsd=0,secretaryPrompt,prepareConversation,parseInterpretation,estimateAICost,pricingVersion,request,emit=()=>{},caseIds}=options;
 if(!['gpt-4.1-mini','gpt-4.1-mini-2025-04-14'].includes(model))throw Error('unknown_model_price');
 const ledger=createLedger(budgetUsd,spentUsd),selected=caseIds?cases.filter(c=>caseIds.includes(c.id)):cases;
 if(caseIds&&selected.length!==caseIds.length)throw Error('invalid_cases');
 const results=[];let stopped=null,calls=0;
 for(const item of selected){
  const context=fixtureContext(item),maxOutput=1200;
  const upper=estimateAICost({provider:'openai',model,inputTokens:Buffer.byteLength(secretaryPrompt+JSON.stringify(context))+2000,cachedInputTokens:0,outputTokens:maxOutput,outcome:'completed'}).estimatedCostUsd;
  try{ledger.reserve(upper);}catch{stopped='budget_stop';break;}
  const row={type:'scenario',id:item.id,message:item.text,expected:item.expected,requestedModel:model,reservedUpperEstimateUsd:upper};
  const started=Date.now();let response;
  calls++;
  try{
   response=await request({model,input:[{role:'system',content:secretaryPrompt},{role:'user',content:JSON.stringify(context)}],temperature:0.2,max_output_tokens:maxOutput,store:false,text:{format:{type:'json_object'}}});
  }catch(error){
   ledger.block();Object.assign(row,{passed:false,error:'provider_error_usage_unknown',status:Number.isInteger(error.status)?error.status:null,latencyMs:Date.now()-started});results.push(row);emit(row);stopped='unknown_usage';break;
  }
  const usage=response.usage;
  const cost=estimateAICost({provider:'openai',model:response.model,inputTokens:usage?.input_tokens,outputTokens:usage?.output_tokens,cachedInputTokens:usage?.input_tokens_details?.cached_tokens,outcome:'completed'});
  const accounted=ledger.settle(upper,cost.estimatedCostUsd);
  Object.assign(row,{model:response.model||null,responseStatus:response.status||null,tokens:{input:usage?.input_tokens??null,cachedInput:usage?.input_tokens_details?.cached_tokens??null,output:usage?.output_tokens??null,total:usage?.total_tokens??null},estimatedCostUsd:cost.estimatedCostUsd??null,costStatus:cost.costStatus,latencyMs:Date.now()-started,rawOutput:response.output_text||'',rawInterpretation:null,interpretation:null,guardedModelUsed:false});
  try{
   if(response.status!=='completed')throw Error('incomplete_response');
   row.rawInterpretation=parseInterpretation(response.output_text);
   row.rawIssues=checkInterpretation(item,row.rawInterpretation);
   row.interpretation=await prepareConversation({phone:'fixture',phoneNumberId:'fixture',text:item.text,receivedAt:new Date(context.now)},{buildContext:async()=>context,interpret:async()=>{row.guardedModelUsed=true;return structuredClone(row.rawInterpretation);}});
   row.issues=checkInterpretation(item,row.interpretation,{guarded:true});
   row.rawPassed=row.rawIssues.length===0;row.passed=row.issues.length===0&&row.rawPassed;
  }catch(error){row.passed=false;row.error='interpretation_or_validation_failure';row.validationError=String(error.message).slice(0,160);}
  results.push(row);emit(row);
  if(!accounted){stopped='unknown_usage_or_cost_bound';break;}
 }
 const summary={type:'summary',evaluation:'context-memory',requestedModel:model,pricingVersion,passed:results.filter(x=>x.passed).length,total:selected.length,providerCalls:calls,stopped,...ledger.snapshot(),databaseWrites:0,whatsappSends:0,note:'Raw model and production interpretation evaluated separately. Estimated text API cost, not invoice. Synthetic supplied context: does not prove retrieval, consent UI, executor or delivery integration.'};
 emit(summary);return {...summary,results};
}
module.exports={cases,fixtureContext,checkInterpretation,createLedger,runEvaluation};
