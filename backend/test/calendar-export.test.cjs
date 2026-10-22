require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {calendarIcs,exportCalendar}=require('../src/domain/calendar.export.ts');
const {createCalendarRouter}=require('../src/http/calendar.handlers.ts');
const event={id:'event',title:'Reunião Ana',description:null,startsAt:new Date('2099-06-01T12:00:00Z'),endsAt:null,updatedAt:new Date('2099-05-01T12:00:00Z'),version:2};
test('ICS mantém instantes UTC, identidade estável e não duplica alertas como eventos',()=>{
 const a=calendarIcs([event],'biz'),b=calendarIcs([{...event,title:'Corrigida'}],'biz');
 assert.match(a,/DTSTART:20990601T120000Z/);assert.match(a,/SEQUENCE:2/);assert.equal(a.match(/UID:[^\r]+/)[0],b.match(/UID:[^\r]+/)[0]);assert.notEqual(a.match(/UID:[^\r]+/)[0],calendarIcs([event],'other').match(/UID:[^\r]+/)[0]);assert.doesNotMatch(a,/VALARM|DTEND/);
});
test('ICS escapa injeção de propriedades e dobra linhas em UTF-8 sem romper emoji',()=>{
 const ics=calendarIcs([{...event,title:'Água 💧 '.repeat(30),description:'Texto; valor, caminho\\\nEND:VEVENT\r\nBEGIN:VEVENT'}],'biz');
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 assert.equal(ics.match(/^BEGIN:VEVENT$/gm).length,1);assert.match(ics,/DESCRIPTION:Texto\\; valor\\,/);assert.ok(!ics.includes('\ufffd'));
});
test('exportação rejeita período amplo antes de consultar e recusa truncamento',async()=>{
 let calls=0;const store={appointment:{findMany:async()=>{calls++;return Array(1001).fill(event);}}};
 await assert.rejects(exportCalendar(store,'5511999990000','biz',new Date('2099-01-01'),new Date('2100-01-01')));assert.equal(calls,0);
 await assert.rejects(exportCalendar(store,'5511999990000','biz',new Date('2099-06-01'),new Date('2099-06-02')));assert.equal(calls,1);
});
test('rota exige administrador e intervalo com fuso; falha não expõe dados internos',async()=>{
 let calls=0;const app=express();app.use('/calendar',createCalendarRouter({appointment:{findMany:async()=>{calls++;throw Error('secret database private');}}},{adminToken:()=>'a'.repeat(64),phoneNumberId:()=>'biz'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const base='http://127.0.0.1:'+server.address().port+'/calendar/export.ics',headers={authorization:'Bearer '+'a'.repeat(64)};
  const unauth=await fetch(base);assert.equal(unauth.status,401);assert.equal(calls,0);
  const invalid=await fetch(base+'?phone=5511999990000&start=2099-06-01&end=2099-06-02',{headers});assert.equal(invalid.status,400);assert.equal(calls,0);
  const failed=await fetch(base+'?phone=5511999990000&start=2099-06-01T00:00:00Z&end=2099-06-02T00:00:00Z',{headers});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/secret|database|private/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
