require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {relayDailySummaries}=require('../src/domain/daily-summary.ts');
const p=createPrismaClient(require('./integration.database.cjs'));
const prefix='daily-summary-'+randomUUID(),phones=[];let sequence=0;
const at=value=>new Date(value),due=()=>at('2099-07-01T11:00:00Z');
async function setup(fields={}){
 const phone='5577'+String(Date.now()).slice(-7)+String(++sequence).padStart(3,'0'),business=prefix+'-'+sequence;phones.push(phone);
 const user=await p.user.create({data:{phone}});
 await p.contactPreference.create({data:{phone,phoneNumberId:business,summaryEnabled:true,summaryTime:'08:00',...fields}});
 return {phone,business,user,update:data=>p.contactPreference.update({where:{phoneNumberId_phone:{phoneNumberId:business,phone}},data})};
}
const digests=business=>p.reminder.findMany({where:{kind:'daily_summary',scheduleOutbox:{phoneNumberId:business}},include:{scheduleOutbox:true},orderBy:{createdAt:'asc'}});
after(async()=>{await p.user.deleteMany({where:{phone:{in:phones}}});await p.contactPreference.deleteMany({where:{phoneNumberId:{startsWith:prefix}}});await p.$disconnect();});

test('resumo diário é opt-in e nunca cria mensagem de entrada para estender janela WhatsApp',async()=>{
 const f=await setup({summaryEnabled:false});
 assert.equal(await relayDailySummaries(p,f.business,due()),0);assert.equal((await digests(f.business)).length,0);
 assert.equal(await p.incomingMessage.count({where:{phoneNumberId:f.business}}),0);
});
test('não agenda antes da hora nem depois da janela de cinco minutos',async()=>{
 const f=await setup();assert.equal(await relayDailySummaries(p,f.business,at('2099-07-01T10:59:59Z')),0);
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-01T11:04:59.999Z')),1);
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-02T11:05:00Z')),0);
 const rows=await digests(f.business);assert.equal(rows.length,1);assert.equal(rows[0].remindAt.toISOString(),'2099-07-01T11:04:59.999Z');
});
test('múltiplos relays concorrentes e reentrega geram um único resumo com uma outbox',async()=>{
 const f=await setup();
 const results=await Promise.all(Array.from({length:6},()=>relayDailySummaries(p,f.business,due())));assert.equal(results.reduce((n,v)=>n+v,0),1);
 assert.equal(await relayDailySummaries(p,f.business,due()),0);
 const rows=await digests(f.business);assert.equal(rows.length,1);assert.equal(rows[0].digestKey,`${f.business}:${f.phone}:2099-07-01`);assert.equal(rows[0].scheduleOutbox.status,'pending');assert.equal(rows[0].status,'scheduling_pending');
 assert.equal(await p.incomingMessage.count({where:{phoneNumberId:f.business}}),0);
});
test('janela e chave diária usam o fuso configurado do contato',async()=>{
 const f=await setup({timezone:'America/Manaus'});
 assert.equal(await relayDailySummaries(p,f.business,due()),0);
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-01T12:00:00Z')),1);
 const [row]=await digests(f.business);assert.equal(row.scheduleTimezone,'America/Manaus');assert.match(row.title,/America\/Manaus/);assert.equal(row.digestKey,`${f.business}:${f.phone}:2099-07-01`);
});
test('não recupera resumo de ontem atravessando meia-noite',async()=>{
 const f=await setup({summaryTime:'23:59'});
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-02T03:00:00Z')),0);
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-02T02:59:00Z')),1);
 assert.equal((await digests(f.business))[0].digestKey,`${f.business}:${f.phone}:2099-07-01`);
});
test('pausa e configurações inválidas não criam avisos',async()=>{
 const paused=await setup({remindersPaused:true}),badZone=await setup({timezone:'Invalid/Zone'}),badTime=await setup({summaryTime:'25:00'});
 for(const f of [paused,badZone,badTime]){assert.equal(await relayDailySummaries(p,f.business,due()),0);assert.equal((await digests(f.business)).length,0);}
 await paused.update({remindersPaused:false});assert.equal(await relayDailySummaries(p,paused.business,due()),1);
});
test('reconfere opt-out e troca de fuso ocorridos entre varredura e transação',async()=>{
 for(const update of [{summaryEnabled:false},{timezone:'America/Manaus'}]){
  const f=await setup();let changed=false;
  const store={contactPreference:p.contactPreference,$transaction:async callback=>{if(!changed){changed=true;await f.update(update);}return p.$transaction(callback);}};
  assert.equal(await relayDailySummaries(store,f.business,due()),0);assert.equal((await digests(f.business)).length,0);
 }
});
test('troca de fuso não permite segundo resumo em menos de vinte horas',async()=>{
 const f=await setup();assert.equal(await relayDailySummaries(p,f.business,due()),1);
 await f.update({timezone:'Asia/Tokyo'});
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-01T23:00:00Z')),0);
 assert.equal(await relayDailySummaries(p,f.business,at('2099-07-02T23:00:00Z')),1);
 assert.equal((await digests(f.business)).length,2);
});
test('texto deriva de tarefas reais isoladas da conta e respeita limite de tamanho',async()=>{
 const f=await setup(),otherBusiness=f.business+'-other';
 for(let i=0;i<5;i++)await p.reminder.create({data:{userId:f.user.id,title:'Tarefa própria '+i+' '+('texto '.repeat(22)),remindAt:at('2099-07-01T15:00:00Z'),scheduleOutbox:{create:{phoneNumberId:f.business}}}});
 await p.reminder.create({data:{userId:f.user.id,title:'SEGREDO DE OUTRA CONTA',remindAt:at('2099-07-01T15:00:00Z'),scheduleOutbox:{create:{phoneNumberId:otherBusiness}}}});
 assert.equal(await relayDailySummaries(p,f.business,due()),1);
 const [row]=await digests(f.business);assert.match(row.title,/Tarefa própria/);assert.doesNotMatch(row.title,/SEGREDO/);assert.ok(row.title.length<=500);assert.match(row.title,/MEU DIA/);
 assert.equal(await p.reminder.count({where:{userId:f.user.id,kind:'task'}}),6);
});
test('a mesma pessoa em outra conta tem preferência e limite independentes',async()=>{
 const f=await setup(),otherBusiness=f.business+'-other';
 await p.contactPreference.create({data:{phone:f.phone,phoneNumberId:otherBusiness,summaryEnabled:true,summaryTime:'08:00'}});
 assert.equal(await relayDailySummaries(p,f.business,due()),1);assert.equal(await relayDailySummaries(p,otherBusiness,due()),1);
 assert.equal((await digests(f.business)).length,1);assert.equal((await digests(otherBusiness)).length,1);
});
test('varredura limitada a cinquenta contatos avança para contatos fora do primeiro lote',async()=>{
 const business=prefix+'-pagination',stamp=String(Date.now()).slice(-7),rows=[];
 for(let i=0;i<51;i++){
  const phone='5576'+stamp+String(i).padStart(3,'0');phones.push(phone);
  rows.push({phone,phoneNumberId:business,summaryEnabled:true,summaryTime:i===50?'08:00':'07:00'});
 }
 await p.contactPreference.createMany({data:rows});
 assert.equal(await relayDailySummaries(p,business,due()),0);
 assert.equal(await relayDailySummaries(p,business,due()),1);
 const found=await digests(business);assert.equal(found.length,1);assert.equal(found[0].digestKey,`${business}:${rows[50].phone}:2099-07-01`);
});
test('falha antes do commit não deixa resumo nem outbox pela metade',async()=>{
 const f=await setup();
 const store={contactPreference:p.contactPreference,$transaction:callback=>p.$transaction(async tx=>{await callback(tx);throw Error('fictional failure before commit');})};
 assert.equal(await relayDailySummaries(store,f.business,due()),0);
 assert.equal((await digests(f.business)).length,0);
 assert.equal(await p.scheduleOutbox.count({where:{phoneNumberId:f.business}}),0);
 assert.equal(await relayDailySummaries(p,f.business,due()),1);
});
