const {test}=require('node:test');
const assert=require('node:assert/strict');
const {whatsappPayload,WhatsAppPreflightError}=require('../src/domain/whatsapp.policy.ts');
const {relativeRescheduleTime}=require('../src/domain/relative-time.ts');
const {deliverReminder}=require('../src/domain/reminder.delivery.ts');
const now=Date.parse('2026-10-20T15:00:00Z');
test('janela aberta permite texto e preserva destinatário',()=>{
 const body=whatsappPayload('5511999990000','Olá',new Date(now-60000),'reply',{},now);
 assert.equal(body.type,'text');assert.equal(body.to,'5511999990000');
});
test('limite de 24 horas e margem nunca permitem texto livre',()=>{
 for(const last of [null,new Date(now-86400000),new Date(now-86350000),new Date(now+1000)]){
  assert.throws(()=>whatsappPayload('5511999990000','aviso',last,'reminder',{},now),WhatsAppPreflightError);
 }
});
test('janela fechada usa somente template explicitamente aprovado',()=>{
 const template={name:'secretaria_lembrete_v1',language:'pt_BR',approved:true};
 const body=whatsappPayload('5511999990000','Lembrete:\nbeber água',null,'reminder',template,now);
 assert.equal(body.type,'template');assert.equal(body.template.components[0].parameters[0].text,'Lembrete: beber água');
 assert.throws(()=>whatsappPayload('5511999990000','aviso',null,'reminder',{...template,approved:false},now));
 assert.throws(()=>whatsappPayload('5511999990000','aviso',null,'reply',template,now));
});
test('adiar duração simples usa o instante original sem alterar fuso',()=>{
 assert.equal(relativeRescheduleTime('Adia por 10 minutos',new Date(now)),new Date(now+600000).toISOString());
 assert.equal(relativeRescheduleTime('Adia o lembrete da água para daqui a 2 horas',new Date(now)),new Date(now+7200000).toISOString());
 for(const text of ['não adia por 10 minutos','adia por 1 hora e 30 minutos','adia por 0 minutos'])assert.equal(relativeRescheduleTime(text,new Date(now)),null);
});
test('job de versão anterior não inicia envio após reagendamento',async()=>{
 const row={id:'r',scheduleVersion:2,scheduleOutbox:{phoneNumberId:'b'}};
 const store={reminder:{findUnique:async()=>row,updateMany:()=>assert.fail('não pode assumir envio')}};
 assert.equal(await deliverReminder('r','b',store,()=>assert.fail('não pode enviar'),1),'stale');
 assert.equal(await deliverReminder('r','b',store,()=>assert.fail('não pode enviar')),'stale');
});
