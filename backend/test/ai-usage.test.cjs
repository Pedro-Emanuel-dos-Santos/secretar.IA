require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {openaiChat}=require('../src/ai/openai.provider.ts');
const {interpretMessage}=require('../src/services/ai.service.ts');
const {openAIUsage}=require('../src/domain/ai.usage.ts');
const input={messages:[{role:'user',content:'fictional request'}],jsonMode:true};
const valid=JSON.stringify({action:'conversation',title:null,description:null,datetime:null,amount:null,category:null,reply:'Olá'});
const response=(fields={})=>({status:'completed',model:'fixture-model',output_text:valid,...fields});
const client=value=>({responses:{create:async()=>value}});

test('uso OpenAI usa modelo retornado e tokens reais com cache, sem somar cache duas vezes',async()=>{
 const result=await openaiChat(input,client(response({usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:80}}})));
 assert.equal(result.usage.provider,'openai');assert.equal(result.usage.model,'fixture-model');
 assert.equal(result.usage.inputTokens,100);assert.equal(result.usage.outputTokens,40);assert.equal(result.usage.cachedInputTokens,80);
 assert.equal(result.usage.outcome,'completed');assert.ok(Number.isInteger(result.usage.elapsedMs)&&result.usage.elapsedMs>=0);
});
test('usage ausente permanece desconhecida, sem assumir zero nem modelo configurado',async()=>{
 const result=await openaiChat(input,client(response({model:undefined,usage:null})));
 for(const key of ['model','inputTokens','outputTokens','cachedInputTokens'])assert.equal(Object.hasOwn(result.usage,key),false,key);
 assert.equal(result.usage.outcome,'completed');
});
test('zero informado pelo provedor é preservado e campos inválidos não viram contagem',()=>{
 const zero=openAIUsage(response({usage:{input_tokens:0,output_tokens:0,input_tokens_details:{cached_tokens:0}}}),0);
 assert.equal(zero.inputTokens,0);assert.equal(zero.outputTokens,0);assert.equal(zero.cachedInputTokens,0);assert.equal(zero.elapsedMs,0);
 const bad=openAIUsage(response({usage:{input_tokens:-1,output_tokens:1.5,input_tokens_details:{cached_tokens:'10'}}}),NaN);
 for(const key of ['inputTokens','outputTokens','cachedInputTokens','elapsedMs'])assert.equal(Object.hasOwn(bad,key),false,key);
 const impossible=openAIUsage(response({usage:{input_tokens:10,output_tokens:2147483648,input_tokens_details:{cached_tokens:11}}}),2);
 assert.equal(impossible.cachedInputTokens,undefined);assert.equal(impossible.outputTokens,undefined);
});
test('resposta incompleta preserva tokens conhecidos com resultado incompleto',async()=>{
 const result=await openaiChat(input,client(response({status:'incomplete',usage:{input_tokens:20,output_tokens:3}})));
 assert.equal(result.usage.outcome,'failed_or_unknown');assert.equal(result.usage.inputTokens,20);assert.equal(result.usage.outputTokens,3);assert.equal(result.usage.cachedInputTokens,undefined);
});
test('medição é observada antes de rejeitar JSON inválido do modelo',async()=>{
 const reports=[];const result=await openaiChat(input,client(response({output_text:'invalid JSON',usage:{input_tokens:50,output_tokens:2}})));
 await assert.rejects(interpretMessage({currentMessage:'fictional'},async report=>{reports.push(report);},async()=>result));
 assert.equal(reports.length,1);assert.equal(reports[0].inputTokens,50);assert.equal(reports[0].outputTokens,2);assert.equal(reports[0].outcome,'completed');
});
test('resposta válida aguarda observador sem colocar conteúdo pessoal no relatório',async()=>{
 const reports=[];const result=await openaiChat(input,client(response({usage:{input_tokens:50,output_tokens:20}})));
 const interpretation=await interpretMessage({currentMessage:'private fictional note'},async report=>{await Promise.resolve();reports.push(report);},async()=>result);
 assert.equal(interpretation.reply,'Olá');assert.equal(reports.length,1);assert.ok(!JSON.stringify(reports).includes('private fictional note'));
 assert.ok(!JSON.stringify(reports).includes(valid));
});
test('falha do provedor é medida como desconhecida, sem tokens inventados nem retry oculto',async()=>{
 const reports=[];let calls=0;const error=Error('fictional network failure');
 const fake={responses:{create:async()=>{calls++;throw error;}}};
 await assert.rejects(interpretMessage({},report=>reports.push(report),async()=>openaiChat(input,fake)),value=>value===error);
 assert.equal(calls,1);assert.equal(reports.length,1);assert.equal(reports[0].outcome,'failed_or_unknown');
 for(const key of ['inputTokens','outputTokens','cachedInputTokens','model'])assert.equal(Object.hasOwn(reports[0],key),false,key);
});
test('provedor sem medição não é contado como consumo zero',async()=>{
 const reports=[];const interpretation=await interpretMessage({},report=>reports.push(report),async()=>({provider:'ollama',content:valid}));
 assert.equal(interpretation.reply,'Olá');assert.equal(reports[0].provider,'ollama');assert.equal(reports[0].inputTokens,undefined);assert.equal(reports[0].outputTokens,undefined);
});
test('erro ao persistir medição não repete chamada paga nem impede ação válida',async()=>{
 let calls=0;const logs=[],original=console.error;console.error=(...args)=>logs.push(args.join(' '));
 try{
  const interpretation=await interpretMessage({},()=>{throw Error('SECRET fictional persistence detail');},async()=>{calls++;return {provider:'openai',content:valid,usage:{provider:'openai',model:'fixture',inputTokens:20,outputTokens:4,outcome:'completed'}};});
  assert.equal(interpretation.reply,'Olá');assert.equal(calls,1);assert.equal(logs.length,1);assert.ok(!logs[0].includes('SECRET'));
 }finally{console.error=original;}
});
