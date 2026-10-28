// Fictional interpretation-only evaluation. No database, executor or WhatsApp.
if(!process.argv.includes('--allow-provider')){console.log('Requires --allow-provider; fictional inputs only.');process.exit(0);}
const OpenAI=require('openai');
const {secretaryPrompt}=require('../dist/prompts/secretary.prompt');
const {parseInterpretation}=require('../dist/domain/interpretation.validation');
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:28000,maxRetries:0}),model=process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const cases=[
 {id:'projects',text:'Me conta como estão todos os projetos que deixei com você, num panorama geral.',action:'workspace_overview',kind:'projects'},
 {id:'clients',text:'Quero uma posição geral dos meus clientes, sem escolher só um.',action:'workspace_overview',kind:'clients'},
 {id:'attention',text:'O que está parado e precisa da minha atenção agora?',action:'workspace_overview',kind:'attention'},
 {id:'waiting',text:'Quem ficou de me responder? Junta os retornos que estou esperando.',action:'workspace_overview',kind:'waiting'},
 {id:'specific',text:'Como está o projeto Praça Central? O que ficou pendente nele?',action:'subject_overview'},
 {id:'write',text:'Anota no projeto Praça Central que o status é em análise.',action:'save_fact'},
 {id:'period',text:'Quais compromissos eu tenho na próxima semana?',action:'agenda_overview'},
];
async function main(){let passed=0,inputTokens=0,outputTokens=0;console.log(JSON.stringify({evaluation:'workspace-overview',model,total:cases.length,databaseWrites:0,whatsappSends:0}));
 for(const item of cases){try{
  const context={now:'2026-10-28T12:00:00Z',user:{timezone:'America/Sao_Paulo'},currentMessage:item.text,subjects:[{id:'fictional-project',name:'Praça Central',kind:'project'},{id:'fictional-client',name:'Cliente Exemplo',kind:'client'}],appointments:[],reminders:[],memories:[],personalMemories:[],personalMemoryEnabled:false,lastMessages:[],conversationState:{pendingRequest:null,focusedSubject:null}};
  const response=await client.responses.create({model,input:[{role:'system',content:secretaryPrompt},{role:'user',content:JSON.stringify(context)}],temperature:0.2,max_output_tokens:1600,store:false,text:{format:{type:'json_object'}}});
  inputTokens+=response.usage?.input_tokens || 0;outputTokens+=response.usage?.output_tokens || 0;
  const value=parseInterpretation(response.output_text),ok=value.action===item.action && (!item.kind || value.overviewKind===item.kind);
  if(ok)passed++;console.log(JSON.stringify({id:item.id,passed:ok,action:value.action,kind:value.overviewKind || null}));
 }catch(error){console.log(JSON.stringify({id:item.id,passed:false,error:'provider_or_validation',status:error.status || null}));}}
 console.log(JSON.stringify({passed,total:cases.length,inputTokens,outputTokens,databaseWrites:0,whatsappSends:0}));if(passed!==cases.length)process.exitCode=1;
}
main().catch(()=>{console.log('EVALUATION_FAILED');process.exitCode=1;});
