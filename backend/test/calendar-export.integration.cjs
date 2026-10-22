require('./register.cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPrismaClient}=require('../src/config/database.ts');
const {exportCalendar}=require('../src/domain/calendar.export.ts');
const p=createPrismaClient(require('./integration.database.cjs')),biz='calendar-'+randomUUID(),phone='5564'+String(Date.now()).slice(-9),other='5565'+String(Date.now()).slice(-9);
const start=new Date('2099-06-01T00:00:00Z'),end=new Date('2099-06-02T00:00:00Z');
after(async()=>{await p.user.deleteMany({where:{phone:{in:[phone,other]}}});await p.$disconnect();});
test('exportação isola contato, conta, estado e fim exclusivo com dados reais no banco',async()=>{
 const user=await p.user.create({data:{phone}}),foreign=await p.user.create({data:{phone:other}});
 for(const data of [{title:'Visita própria',userId:user.id,phoneNumberId:biz,startsAt:start},{title:'Outro contato',userId:foreign.id,phoneNumberId:biz,startsAt:start},{title:'Outra conta',userId:user.id,phoneNumberId:biz+'other',startsAt:start},{title:'Cancelada',userId:user.id,phoneNumberId:biz,startsAt:start,state:'cancelled'},{title:'Dia seguinte',userId:user.id,phoneNumberId:biz,startsAt:end}])await p.appointment.create({data});
 const ics=await exportCalendar(p,phone,biz,start,end);assert.match(ics,/Visita própria/);assert.doesNotMatch(ics,/Outro contato|Outra conta|Cancelada|Dia seguinte/);assert.equal(ics.match(/BEGIN:VEVENT/g).length,1);
});
test('agenda vazia exporta calendário válido sem criar registros nem envios',async()=>{
 const before=await p.appointment.count();const ics=await exportCalendar(p,phone,biz,new Date('2099-08-01'),new Date('2099-08-02'));assert.match(ics,/BEGIN:VCALENDAR/);assert.doesNotMatch(ics,/BEGIN:VEVENT/);assert.equal(await p.appointment.count(),before);
});
