require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
test('interpretador solicita JSON real, limita saída e não solicita armazenamento da resposta',async()=>{
 const {openaiChat}=require('../src/ai/openai.provider.ts');
 let body;
 const client={responses:{create:async input=>{body=input;return{output_text:'{"action":"unknown"}'}}}};
 const result=await openaiChat({messages:[{role:'system',content:'Return JSON'},{role:'user',content:'request'}],jsonMode:true},client);
 assert.deepEqual(body.text,{format:{type:'json_object'}});assert.equal(body.store,false);assert.equal(body.max_output_tokens,1600);
 assert.equal(result.content,'{"action":"unknown"}');
});
test('configuração desconhecida não escolhe provedor pago silenciosamente',async()=>{
 const previous=process.env.AI_MODE;process.env.AI_MODE='typo';
 try{const {aiRouter}=require('../src/ai/ai-router.ts');await assert.rejects(aiRouter({jsonMode:true,messages:[{role:'user',content:'request'}]}),/inválido/);}
 finally{if(previous===undefined)delete process.env.AI_MODE;else process.env.AI_MODE=previous}
});
