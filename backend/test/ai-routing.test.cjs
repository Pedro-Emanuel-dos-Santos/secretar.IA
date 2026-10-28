require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chooseAIRoute,aiRouter,AIRoutingError}=require('../src/ai/ai-router.ts');
const {estimateAICost}=require('../src/domain/ai.cost.ts');
const {interpretMessage}=require('../src/services/ai.service.ts');
const hybrid={AI_MODE:'hybrid',OLLAMA_BASE_URL:'http://fixture.local'};
const input=(currentMessage,history='')=>({jsonMode:true,currentMessage,messages:[{role:'user',content:JSON.stringify({currentMessage,lastMessages:[{text:history}]})}]});
const valid=JSON.stringify({action:'conversation',reply:'Olá'});
const result={provider:'openai',content:valid,usage:{provider:'openai',model:'gpt-4.1-mini-2025-04-14',inputTokens:1000,cachedInputTokens:500,outputTokens:100,outcome:'completed'}};
test('decisão usa intenção atual e ignora tamanho e palavras de contrato no histórico',()=>{
 for(const history of ['', 'analise contrato planeje '.repeat(1000)])assert.deepEqual(chooseAIRoute(input('oi',history),hybrid),{provider:'ollama',reason:'current_request_simple',fallback:true});
 assert.equal(chooseAIRoute(input('Planeje minha semana'),hybrid).provider,'openai');
 const compatibility=input('oi','x'.repeat(1000));delete compatibility.currentMessage;assert.equal(chooseAIRoute(compatibility,hybrid).provider,'ollama');
 assert.equal(chooseAIRoute(input('oi'),{}).reason,'configured_primary_openai');
 assert.equal(chooseAIRoute(input('oi'),{AI_MODE:'hybrid'}).reason,'local_endpoint_not_configured');
 assert.throws(()=>chooseAIRoute(input('oi'),{AI_MODE:'invalid'}),/inválido/);
});
test('OpenAI principal não consulta Ollama e registra rota, modelo real, latência e custo',async()=>{
 const r=await aiRouter(input('private fixture'),{env:{AI_MODE:'openai'},openai:async()=>result,ollama:()=>assert.fail()});
 assert.equal(r.usage.providerAttempts.length,1);assert.equal(r.usage.fallbackUsed,false);assert.equal(r.usage.routingReason,'configured_primary_openai');assert.equal(r.usage.model,result.usage.model);assert.equal(r.usage.estimatedCostUsd,0.00041);assert.ok(r.usage.elapsedMs>=0);assert.doesNotMatch(JSON.stringify(r.usage),/private fixture/);
});
test('fallback registra falha local e sucesso OpenAI; erro privado não entra no ledger',async()=>{
 const r=await aiRouter(input('oi'),{env:hybrid,ollama:async()=>{throw Error('SECRET private provider body');},openai:async()=>result});
 assert.equal(r.usage.fallbackUsed,true);assert.deepEqual(r.usage.providerAttempts.map(x=>x.provider),['ollama','openai']);assert.equal(r.usage.providerAttempts[0].outcome,'failed_or_unknown');assert.equal(r.usage.providerAttempts[0].inputTokens,undefined);assert.doesNotMatch(JSON.stringify(r.usage),/SECRET|private/);
});
test('falha dos dois provedores é observada uma vez com ambas tentativas sem retry invisível',async()=>{
 const reports=[];let calls=0;
 await assert.rejects(interpretMessage({currentMessage:'oi'},u=>reports.push(u),i=>aiRouter(i,{env:hybrid,ollama:async()=>{calls++;throw Error('private');},openai:async()=>{calls++;throw Error('private');}})),AIRoutingError);
 assert.equal(calls,2);assert.equal(reports.length,1);assert.equal(reports[0].providerAttempts.length,2);assert.equal(reports[0].fallbackUsed,true);assert.equal(reports[0].estimatedCostUsd,undefined);
});
test('modo local explícito não usa fallback pago e JSON inválido não dispara provedor extra',async()=>{
 let paid=0;
 await assert.rejects(aiRouter(input('oi'),{env:{AI_MODE:'ollama'},ollama:async()=>{throw Error();},openai:async()=>{paid++;return result;}}),AIRoutingError);
 await assert.rejects(interpretMessage({currentMessage:'oi'},undefined,i=>aiRouter(i,{env:hybrid,ollama:async()=>({provider:'ollama',content:'invalid JSON'}),openai:async()=>{paid++;return result;}})));
 assert.equal(paid,0);
});
test('estimativa respeita cache e mantém desconhecidos sem inventar modelo ou tokens',()=>{
 assert.equal(estimateAICost(result.usage).estimatedCostUsd,0.00041);
 for(const fields of [{model:'gpt-4.1-mini-custom'},{inputTokens:undefined},{outputTokens:undefined},{cachedInputTokens:undefined},{cachedInputTokens:1001},{inputTokens:-1}])assert.equal(estimateAICost({...result.usage,...fields}).estimatedCostUsd,undefined);
 assert.equal(estimateAICost({...result.usage,inputTokens:0,cachedInputTokens:undefined,outputTokens:0}).estimatedCostUsd,0);
});
