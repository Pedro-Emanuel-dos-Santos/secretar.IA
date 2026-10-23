require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {availableSlots,appointmentAlternatives,slotLabel}=require('../src/domain/appointment.slots.ts');
const {chooseAppointmentSuggestion}=require('../src/domain/appointment.suggestions.ts');
const date=t=>new Date('2099-06-01T'+t+':00Z'),busy=(start,end)=>({startsAt:date(start),endsAt:end?date(end):null});
test('alternativas respeitam duração, adjacência e blocos sobrepostos',()=>{
 const slots=availableSlots([busy('10:00','11:00'),busy('10:30','11:30'),busy('12:30','13:30')],date('10:00'),date('16:00'),3600000);
 assert.deepEqual(slots.map(s=>s.startsAt.toISOString().slice(11,16)),['11:30','13:30','14:30']);assert.ok(slots.every(s=>s.endsAt-s.startsAt===3600000));
});
test('evento sem término bloqueia o restante da janela e não inventa espaço',()=>{
 const slots=availableSlots([busy('11:00',null)],date('10:00'),date('16:00'),3600000);assert.equal(slots.length,1);assert.equal(slots[0].startsAt.toISOString().slice(11,16),'10:00');
 assert.deepEqual(availableSlots([busy('09:00',null)],date('10:00'),date('16:00'),3600000),[]);
});
test('janela curta ou inválida não produz horário fora do período',()=>{
 assert.equal(availableSlots([],date('23:30'),date('23:59'),3600000).length,0);assert.equal(availableSlots([],date('10:00'),date('12:00'),0).length,0);
});
const suggestions={id:'snapshot',items:[{startsAt:date('11:00').toISOString(),endsAt:date('12:00').toISOString()},{startsAt:date('12:00').toISOString(),endsAt:date('13:00').toISOString()}],request:{action:'create_appointment',title:'Consulta original',description:null,datetime:date('10:00').toISOString(),amount:null,category:null,reply:'interno',durationMinutes:60}};
test('escolha restaura pedido original sem campos inventados durante a seleção',()=>{
 for(const text of ['a segunda opção','opção 2','pode marcar a segunda']){
  const i={action:'cancel_reminder',title:'Errada',reminderId:'fake',alertMinutes:[999],reply:'interno'};chooseAppointmentSuggestion(i,text,suggestions);assert.equal(i.action,'create_appointment');assert.equal(i.title,'Consulta original');assert.equal(i.datetime,suggestions.items[1].startsAt);assert.equal(i.alertMinutes,undefined);assert.equal(i.reminderId,undefined);assert.equal(i.appointmentSuggestionIndex,1);
 }
});
test('pergunta, negação, comentário ou dia da semana não escolhem uma opção',()=>{
 for(const text of ['não quero a segunda','a segunda?','segunda','talvez a primeira','a primeira e a segunda','valeu']){const i={action:'conversation',reply:'interno'};chooseAppointmentSuggestion(i,text,suggestions);assert.equal(i.action,'conversation',text);assert.equal(i.appointmentSuggestionId,undefined);}
 const forged={action:'conversation',appointmentSuggestionId:'inventada',appointmentSuggestionIndex:1};chooseAppointmentSuggestion(forged,'oi',null);assert.equal(forged.appointmentSuggestionId,undefined);
});
test('negação ou pergunta sobre opção não executa ação errada do modelo',()=>{
 for(const text of ['não quero a segunda opção','a segunda?','talvez a primeira']){const i={action:'cancel_appointment',appointmentId:'wrong',reply:'interno'};chooseAppointmentSuggestion(i,text,suggestions);assert.equal(i.action,'conversation');assert.equal(i.appointmentId,null);}
});
test('alternativa depois de término com segundos é arredondada para minuto completo',()=>{
 const endsAt=new Date('2099-06-01T11:00:30Z');const slots=availableSlots([{startsAt:date('10:00'),endsAt}],date('10:00'),date('13:00'),3600000);assert.equal(slots[0].startsAt.toISOString(),'2099-06-01T11:01:00.000Z');
});
test('dia com mudança de fuso não é tratado como janela fixa de 24 horas',async()=>{
 const store={appointment:{findMany:async()=>[]}};
 assert.equal((await appointmentAlternatives(store,'phone','biz',new Date('2027-03-14T05:00:00Z'),86400000,'America/New_York')).length,0);
 const label=slotLabel({startsAt:new Date('2027-03-14T06:30:00Z'),endsAt:new Date('2027-03-14T07:30:00Z')},'America/New_York');assert.match(label,/GMT-5/);assert.match(label,/GMT-4/);
});
test('opções em hora repetida de mudança de fuso têm rótulos distintos',()=>{
 const a=slotLabel({startsAt:new Date('2027-11-07T05:00:00Z'),endsAt:new Date('2027-11-07T05:30:00Z')},'America/New_York');
 const b=slotLabel({startsAt:new Date('2027-11-07T06:00:00Z'),endsAt:new Date('2027-11-07T06:30:00Z')},'America/New_York');assert.notEqual(a,b);assert.match(a,/GMT-4/);assert.match(b,/GMT-5/);
});
