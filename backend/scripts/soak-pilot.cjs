// Endurance test: isolated local *_test database only; no network sender/provider.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const databaseUrl=process.env.INBOX_TEST_DATABASE_URL;
if(!databaseUrl)throw Error('Configure INBOX_TEST_DATABASE_URL.');
const parsed=new URL(databaseUrl);
if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!parsed.pathname.endsWith('_test'))throw Error('Somente banco local isolado *_test.');
const seconds=Number(process.env.SOAK_SECONDS||600);
if(!Number.isInteger(seconds)||seconds<10||seconds>1800)throw Error('SOAK_SECONDS deve estar entre 10 e 1800.');
const {createPrismaClient}=require('../dist/config/database');
const {processInboxBatch}=require('../dist/domain/inbox.processor');
const {relaySchedules}=require('../dist/domain/schedule.relay');
const {deliverReminder}=require('../dist/domain/reminder.delivery');
const {relayReplies}=require('../dist/domain/reply.relay');
const {manageReminders}=require('../dist/domain/reminder.management');
const p=createPrismaClient(databaseUrl);
const business='soak-'+randomUUID(),phone='5577'+String(Date.now()).slice(-9);
let stop=false;process.on('SIGINT',()=>{stop=true});process.on('SIGTERM',()=>{stop=true});
async function clear(){await p.user.deleteMany({where:{phone}});await p.incomingMessage.deleteMany({where:{phoneNumberId:business}});await p.contactPreference.deleteMany({where:{phoneNumberId:business}})}
async function main(){
 const began=Date.now(),until=began+seconds*1000;let cycles=0,maxRss=0,nextReport=began;
 try{
  while(!stop && Date.now()<until){
   if(cycles % 10 === 0){
    const controls={buildContext:async()=>({}),interpret:async()=>({action:'create_reminder',title:'controle de pausa',description:null,datetime:new Date(Date.now()+86400000).toISOString(),amount:null,category:null,reply:'interno'})};
    for(const text of ['PARAR','pedido durante pausa','RETOMAR','MEU DIA','PRIVACIDADE']){
     await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text}});
     await processInboxBatch(p,controls,business);
     assert.equal(await p.reminder.count({where:{user:{phone}}}),0);
    }
    assert.equal((await p.contactPreference.findUniqueOrThrow({where:{phoneNumberId_phone:{phoneNumberId:business,phone}}})).remindersPaused,false);
    await relayReplies(p,async()=>({messages:[{id:'wamid.synthetic-'+randomUUID()}]}),business);
    await clear();
   }
   const message=await p.incomingMessage.create({data:{phoneNumberId:business,phone,providerMessageId:randomUUID(),text:'mensagem sintética de estabilidade'}});
   let interpretations=0,reminderSends=0,replySends=0;
   const deps={buildContext:async()=>({}),interpret:async()=>{interpretations++;return{action:'create_reminder',title:'orçamento sintético',description:null,datetime:new Date(Date.now()+86400000).toISOString(),amount:null,category:null,reply:'interno'}}};
   await Promise.all([processInboxBatch(p,deps,business),processInboxBatch(p,deps,business)]);
   assert.equal(interpretations,1);
   const reminder=await p.reminder.findUniqueOrThrow({where:{sourceMessageId:message.id}});
   const jobs=new Map();const queue={add:async(name,data,options)=>jobs.set(options.jobId,data)};
   await Promise.all([relaySchedules(p,queue,{phoneNumberId:business}),relaySchedules(p,queue,{phoneNumberId:business})]);
   assert.equal(jobs.size,1);
   const sender=async()=>{reminderSends++;return{messages:[{id:'wamid.synthetic-'+randomUUID()}]}};
   await Promise.all([deliverReminder(reminder.id,business,p,sender),deliverReminder(reminder.id,business,p,sender)]);
   assert.equal(reminderSends,1);
   const replySender=async()=>{replySends++;return{messages:[{id:'wamid.synthetic-'+randomUUID()}]}};
   await Promise.all([relayReplies(p,replySender,business),relayReplies(p,replySender,business)]);
   assert.equal(replySends,1);
   await p.$transaction(tx=>manageReminders(phone,business,{action:'complete_reminder',title:null,description:null,datetime:null,amount:null,category:null,reply:'interno',reminderId:reminder.id,expectedVersion:0},tx));
   assert.equal((await p.reminder.findUniqueOrThrow({where:{id:reminder.id}})).state,'completed');
   await clear();cycles++;maxRss=Math.max(maxRss,process.memoryUsage().rss);
   if(Date.now()>=nextReport){console.log(JSON.stringify({cycles,elapsedSeconds:Math.round((Date.now()-began)/1000),rssMB:Math.round(process.memoryUsage().rss/1048576),peakRssMB:Math.round(maxRss/1048576)}));nextReport=Date.now()+60000;}
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  console.log(JSON.stringify({result:'passed',cycles,elapsedSeconds:Math.round((Date.now()-began)/1000),peakRssMB:Math.round(maxRss/1048576)}));
 }finally{await clear();await p.$disconnect()}
}
main().catch(error=>{console.error('Soak failed:',error.name);process.exitCode=1});
