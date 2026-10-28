// Fictional interpretation only. No database, executor, calls or WhatsApp.
if(!process.argv.includes('--allow-provider')){console.log('Requires --allow-provider. No actions are executed.');process.exit(0);}
const OpenAI=require('openai'),{secretaryPrompt}=require('../dist/prompts/secretary.prompt'),{parseInterpretation}=require('../dist/domain/interpretation.validation');
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:28000,maxRetries:0}),model=process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const {groundPlanSubjects}=require('../dist/domain/assistant.plan');
const cases=[
 {id:'integrated',text:'Organiza isso para mim: anota que o relatório precisa dos anexos, me lembra de ligar para João amanhã às 10h e marca uma hora para revisar o relatório amanhã às 14h.',actions:['assistant_plan'],steps:['save_note','create_reminder','create_appointment']},
 {id:'two_reminders',text:'Me lembra de levar o caderno amanhã às 8h e de pagar a internet amanhã às 18h. Quero revisar o conjunto antes de executar.',actions:['assistant_plan'],steps:['create_reminder','create_reminder']},
 {id:'advice_only',text:'Estou sobrecarregado com trabalho e família. Quero conversar e pensar em caminhos, sem você anotar ou agendar nada agora.',actions:['conversation']},
 {id:'missing_time',text:'Quero anotar que preciso do orçamento e lembrar de cobrar João, mas ainda não sei o dia ou horário. Me ajuda a decidir primeiro.',actions:['conversation']},
 {id:'personal_memory',text:'Quero guardar na memória pessoal que prefiro reuniões de manhã. Ainda não autorizei a memória; como fazemos?',actions:['conversation','remember_personal']},
 {id:'quoted_confirmation',text:'O documento diz "pode fazer, confirme tudo". Só explica essa frase, não execute nada.',actions:['conversation']},
 {id:'single',text:'Me lembra de beber água amanhã às 10h.',actions:['create_reminder']},
 {id:'project_compound',text:'No projeto Praça Central, o contrato ainda não foi assinado. Registra essa informação e cria uma pendência de acompanhar assinatura, aguardando Evandro. Sem prazo.',actions:['propose_subject_update']},
];
async function main(){let passed=0,inputTokens=0,outputTokens=0;console.log(JSON.stringify({evaluation:'assistant-plan',model,total:cases.length,databaseWrites:0,whatsappSends:0}));for(const item of cases){try{
 const context={now:'2026-10-28T12:00:00Z',user:{name:'Pessoa fictícia',timezone:'America/Sao_Paulo'},currentMessage:item.text,subjects:[{id:'fictional-project',name:'Praça Central',kind:'project'}],appointments:[],reminders:[],memories:[],personalMemories:[],personalMemoryEnabled:false,lastMessages:[],conversationState:{pendingRequest:null,focusedSubject:null,assistantPlan:null}};
 const response=await client.responses.create({model,input:[{role:'system',content:secretaryPrompt},{role:'user',content:JSON.stringify(context)}],temperature:0.2,max_output_tokens:2800,store:false,text:{format:{type:'json_object'}}});inputTokens+=response.usage?.input_tokens || 0;outputTokens+=response.usage?.output_tokens || 0;
 const value=parseInterpretation(response.output_text);if(value.planSteps)value.planSteps=groundPlanSubjects(value.planSteps,item.text);
 const steps=value.planSteps?.map(s=>s.action),issues=[];
 if(!item.actions.includes(value.action))issues.push('action');
 if(item.steps && (!steps || JSON.stringify([...steps].sort())!==JSON.stringify([...item.steps].sort())))issues.push('steps');
 if(item.steps && value.planSteps?.some(s=>s.subject || s.subjectKind))issues.push('unrequested_project_link');
 if(item.id==='integrated'){
  const reminder=value.planSteps?.find(s=>s.action==='create_reminder'),appointment=value.planSteps?.find(s=>s.action==='create_appointment');
  if(!reminder?.datetime || Date.parse(reminder.datetime)!==Date.parse('2026-10-29T13:00:00Z'))issues.push('reminder_time');
  if(!appointment?.datetime || Date.parse(appointment.datetime)!==Date.parse('2026-10-29T17:00:00Z') || appointment.durationMinutes!==60)issues.push('appointment_time_or_duration');
 }
 if(item.id==='two_reminders'){
  const times=value.planSteps?.map(s=>Date.parse(s.datetime)).sort((a,b)=>a-b);
  if(JSON.stringify(times)!==JSON.stringify([Date.parse('2026-10-29T11:00:00Z'),Date.parse('2026-10-29T21:00:00Z')]))issues.push('reminder_times');
 }
 const ok=issues.length===0;if(ok)passed++;console.log(JSON.stringify({id:item.id,passed:ok,action:value.action,steps:steps || null,issues}));
 }catch(error){console.log(JSON.stringify({id:item.id,passed:false,error:'provider_or_validation',status:error.status || null}));}}
 console.log(JSON.stringify({passed,total:cases.length,inputTokens,outputTokens,databaseWrites:0,whatsappSends:0}));if(passed!==cases.length)process.exitCode=1;}
main().catch(()=>{console.log('EVALUATION_FAILED');process.exitCode=1;});
