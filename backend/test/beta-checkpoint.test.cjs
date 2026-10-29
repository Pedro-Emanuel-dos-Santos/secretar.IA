require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {evaluateCheckpoint,createCheckpointLock}=require('../scripts/beta-model-checkpoint.cjs'),{estimateAICost}=require('../src/domain/ai.cost.ts');
const fixture={label:'plan',fictional:true,prompt:'Fictional JSON',context:{currentMessage:'Fictional task'}};fixture.requestSha256=createHash('sha256').update(JSON.stringify({prompt:fixture.prompt,context:fixture.context})).digest('hex');
const options={fixture,model:'gpt-4.1-mini',spentUsd:.0744716,estimateAICost};
test('checkpoint exclusive lock prevents concurrent duplicate paid calls',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'secretaria-beta-fixture-')),destination=path.join(dir,'response.json');let lock;
 try{lock=createCheckpointLock(destination,{fictional:true});assert.throws(()=>createCheckpointLock(destination,{fictional:true}),{code:'EEXIST'});}finally{if(lock)fs.unlinkSync(lock);fs.rmdirSync(dir);}
});
test('checkpoint rejects tampered/nonfictional contexts before invoking provider',async()=>{
 for(const f of [{...fixture,fictional:false},{...fixture,context:{currentMessage:'changed'}}])await assert.rejects(()=>evaluateCheckpoint({...options,fixture:f,request:()=>assert.fail()}));
});
test('checkpoint cumulative budget prevents calls when prior spending consumes remaining bound',async()=>{
 await assert.rejects(()=>evaluateCheckpoint({...options,spentUsd:.09999,request:()=>assert.fail()}),/budget_stop/);
 await assert.rejects(()=>evaluateCheckpoint({...options,spentUsd:undefined,request:()=>assert.fail()}),/cumulative/);
});
test('checkpoint persists known usage cost and does not reset cumulative spending',async()=>{
 let calls=0;const r=await evaluateCheckpoint({...options,request:async body=>{calls++;assert.equal(body.store,false);assert.equal(body.max_output_tokens,1200);return {status:'completed',model:'gpt-4.1-mini-2025-04-14',output_text:'{}',usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0}}};}});assert.equal(calls,1);assert.equal(r.estimatedCostUsd,.000072);assert.equal(r.budget.cumulativeEstimatedCostUsd,.0745436);
});
test('checkpoint provider failure never leaks error content or assumes zero cost',async()=>{
 let calls=0;const r=await evaluateCheckpoint({...options,request:async()=>{calls++;throw Error('PRIVATE VALUE');}});assert.equal(calls,1);assert.equal(r.budget.blocked,true);assert.ok(r.budget.uncertainReservedUsd>0);assert.doesNotMatch(JSON.stringify(r),/PRIVATE VALUE/);
});
