// Synthetic language evaluation. Never reads contacts, sends WhatsApp or writes DB.
if(!process.argv.includes('--allow-provider')){console.log('Use --allow-provider para avaliar frases fictícias no provedor de texto configurado. Pode haver custo de tokens.');process.exit(0)}
const {prepareConversation}=require('../dist/domain/conversation.processor');
const {interpretMessage}=require('../dist/services/ai.service');
const {relativeReminderTime}=require('../dist/domain/relative-time');
const now=new Date('2099-06-01T15:00:00Z');
const reminderId='00000000-0000-4000-8000-000000000001';
const scenarios=[
 ['create_exact','Me lembra amanhã às 9h de enviar o orçamento.',['create_reminder'],r=>r.datetime==='2099-06-02T09:00:00-03:00'||new Date(r.datetime).toISOString()==='2099-06-02T12:00:00.000Z'],
 ['relative_spoken','Me lembra daqui a dois minutos de ligar para o fornecedor.',['create_reminder'],r=>r.datetime==='2099-06-01T15:02:00.000Z'],
 ['create_task_first','Quero beber água em um minuto.',['create_reminder'],r=>r.datetime==='2099-06-01T15:01:00.000Z'],
 ['create_task_first_short','Me lembra de tomar água daqui a 1 min',['create_reminder'],r=>r.datetime==='2099-06-01T15:01:00.000Z'],
 ['missing_time','Me lembra de ligar para o cliente.',['create_reminder','conversation'],r=>r.datetime===null],
 ['daily_series','Me lembra todo dia às 9h de revisar orçamentos, por 3 vezes, começando amanhã.',['create_reminder'],r=>r.recurrence?.frequency==='daily'&&r.recurrence?.count===3],
 ['series_missing_count','Toda segunda às 9h, me lembra de revisar orçamentos.',['create_reminder','conversation'],r=>r.action==='conversation'||r.recurrence?.count===null],
 ['unsupported_interval','Me lembra a cada dois dias às 9h de revisar orçamentos, por 3 vezes.',['conversation','unknown']],
 ['list_today','Quais são os meus lembretes de hoje?',['list_reminders'],r=>!!r.rangeStart&&!!r.rangeEnd],
 ['cancel','Cancela o lembrete de enviar o orçamento.',['cancel_reminder']],
 ['complete','Já enviei o orçamento. Marca esse lembrete como concluído.',['complete_reminder']],
 ['reschedule','Adia o lembrete de enviar o orçamento para amanhã às 10h.',['reschedule_reminder']],
 ['cancel_series','Cancela a série de revisar orçamentos.',['cancel_reminder'],r=>r.cancelSeries===true],
 ['unsupported_rename','Muda o título do lembrete de enviar o orçamento para revisar o contrato.',['conversation','unknown']],
 ['multiple_tasks','Me lembra amanhã às 9h de ligar para João e amanhã às 16h de comprar material.',['conversation','unknown']],
 ['external_send','Envia uma mensagem agora para meu cliente cobrando o orçamento.',['conversation','unknown']],
 ['help','AJUDA',['conversation']],['pause','PARAR',['conversation']],['resume','RETOMAR',['conversation']],['day','MEU DIA',['conversation']],
];
const selected=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
async function main(){const results=[];for(const [name,text,actions,check]of scenarios){
 if(selected&&selected!==name)continue;
 const context={now:now.toISOString(),processingAt:now.toISOString(),user:{name:'Profissional fictício',timezone:'America/Sao_Paulo'},currentMessage:text,
 reminders:name.startsWith('create')||['relative_spoken','missing_time','daily_series','series_missing_count','unsupported_interval','multiple_tasks','external_send'].includes(name)?[]:[{id:reminderId,title:'enviar o orçamento',remindAt:'2099-06-02T12:00:00Z',state:'active',status:'scheduled'},
 {id:'00000000-0000-4000-8000-000000000002',title:'revisar orçamentos',remindAt:'2099-06-03T12:00:00Z',state:'active',status:'scheduled',seriesId:'synthetic-series',recurrenceCount:3,recurrenceFrequency:'weekly'}],lastMessages:[],memories:[],habits:[]};
 const started=Date.now();
 try{const result=await prepareConversation({phone:'5511999990000',phoneNumberId:'synthetic-business',text,receivedAt:now},{buildContext:async()=>context,interpret:interpretMessage});
 const passed=actions.includes(result.action)&&(!check||check(result));results.push({name,passed,action:result.action,elapsedMs:Date.now()-started,
  ...(!passed?{syntheticReply:result.reply,datetime:result.datetime,recurrence:result.recurrence}:{} )});}
 catch(error){results.push({name,passed:false,error:error.name,elapsedMs:Date.now()-started});}
 console.log(JSON.stringify(results[results.length-1]));
 }
 const summary={kind:'synthetic_intent_eval',cases:results.length,passed:results.filter(r=>r.passed).length,results};
 if(process.env.EVAL_REPORT_PATH)require('node:fs').writeFileSync(process.env.EVAL_REPORT_PATH,JSON.stringify(summary,null,2));
 if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error.name);process.exitCode=1});
