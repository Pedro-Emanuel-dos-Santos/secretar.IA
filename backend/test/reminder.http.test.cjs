require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createReminderHandler}=require('../src/http/reminder.handlers.ts');
test('API distingue entrada inválida de falha interna sem expor conteúdo privado',async()=>{
 let writes=0;
 const app=express();app.use(express.json());app.post('/reminders',createReminderHandler(async()=>{writes++;throw Error('postgresql://secret-password@private-host query user private content')}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 try{
  const url='http://127.0.0.1:'+server.address().port+'/reminders';
  const bad=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(bad.status,400);assert.equal(writes,0);
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'5511999990000',title:'tarefa',remindAt:'2099-01-01T09:00:00-03:00'})});
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret|postgresql|query|private/);assert.equal(writes,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
