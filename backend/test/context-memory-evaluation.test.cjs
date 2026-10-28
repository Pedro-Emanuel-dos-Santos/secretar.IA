require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {cases,fixtureContext,checkInterpretation,createLedger,runEvaluation}=require('../scripts/lib/context-memory-evaluation.cjs');
const {prepareConversation}=require('../src/domain/conversation.processor.ts');
const {parseInterpretation}=require('../src/domain/interpretation.validation.ts');
const {estimateAICost,pricingVersion}=require('../src/domain/ai.cost.ts');
const intent=(action,fields={})=>({action,reply:'Qual compromisso mudou?',...fields});
function options(request,extra={}){return {model:'gpt-4.1-mini',budgetUsd:.1,secretaryPrompt:'fictional JSON evaluation',prepareConversation,parseInterpretation,estimateAICost,pricingVersion,request,...extra};}
const response=(value,extra={})=>({status:'completed',model:'gpt-4.1-mini-2025-04-14',output_text:JSON.stringify(value),usage:{input_tokens:100,output_tokens:30,total_tokens:130,input_tokens_details:{cached_tokens:0}},...extra});
test('evaluation cumulative ledger reserves before spending and carries earlier rounds',()=>{
 const l=createLedger(.1,.08);assert.throws(()=>l.reserve(.021));l.reserve(.02);assert.equal(l.settle(.02,.005),true);assert.equal(l.snapshot().cumulativeEstimatedCostUsd,.085);assert.throws(()=>l.reserve(.016));
 for(const value of [NaN,0,-1,.11])assert.throws(()=>createLedger(value));
 const exceeded=createLedger(.1);exceeded.reserve(.01);assert.equal(exceeded.settle(.01,.012),false);assert.equal(exceeded.snapshot().cumulativeEstimatedCostUsd,.012);assert.equal(exceeded.snapshot().uncertainReservedUsd,0);assert.throws(()=>exceeded.reserve(.01));
});
test('evaluation stops after unknown usage and retains the uncertain reservation',async()=>{
 let calls=0;const r=await runEvaluation(options(async()=>{calls++;return response(intent('recall_context',{search:'trabalho'}),{usage:undefined});}));
 assert.equal(calls,1);assert.equal(r.stopped,'unknown_usage_or_cost_bound');assert.ok(r.uncertainReservedUsd>0);assert.equal(r.results[0].estimatedCostUsd,null);
});
test('provider errors are sanitized, never retried and never treated as free',async()=>{
 let calls=0;const r=await runEvaluation(options(async()=>{calls++;throw Object.assign(Error('secret must not appear'),{status:429});}));
 assert.equal(calls,1);assert.equal(r.stopped,'unknown_usage');assert.ok(r.uncertainReservedUsd>0);assert.doesNotMatch(JSON.stringify(r),/secret must/);
});
test('all eight scenarios call model even when deterministic recall bypasses it in production',async()=>{
 let calls=0;const r=await runEvaluation(options(async()=>{calls++;return response(intent('conversation'));}));
 assert.equal(calls,8);assert.equal(r.results.length,8);assert.equal(r.results[0].guardedModelUsed,false);assert.equal(r.results[0].interpretation.action,'recall_context');assert.equal(r.results[0].passed,false);assert.equal(r.results[0].rawPassed,false);
 assert.equal(r.results[0].model,'gpt-4.1-mini-2025-04-14');assert.equal(r.results[0].tokens.total,130);assert.equal(r.estimatedCostUsd,.000704);
});
test('malformed output is accounted, fails validation and does not prevent remaining known-cost cases',async()=>{
 const r=await runEvaluation(options(async()=>response(null,{output_text:'not JSON'})));
 assert.equal(r.providerCalls,8);assert.equal(r.passed,0);assert.ok(r.estimatedCostUsd>0);assert.equal(r.results[0].rawOutput,'not JSON');
});
test('budget exhaustion and unpriced models prevent calls',async()=>{
 let calls=0;const r=await runEvaluation(options(async()=>{calls++;return response(intent('conversation'));},{spentUsd:.09999}));assert.equal(calls,0);assert.equal(r.stopped,'budget_stop');
 await assert.rejects(()=>runEvaluation(options(()=>assert.fail(),{model:'unpriced'})),/unknown_model/);
});
test('oracles reject wrong date, target, dropped action, vague advice and false execution',()=>{
 const find=id=>cases.find(x=>x.id===id);
 assert.ok(checkInterpretation(find('interview_advice'),intent('conversation',{reply:'Você vai conseguir!'})).includes('missing_context'));
 assert.ok(checkInterpretation(find('interview_advice'),intent('conversation',{reply:'Sua entrevista técnica está próxima. Quer ajuda para se preparar?'})).includes('missing_actionable_advice'));
 assert.deepEqual(checkInterpretation(find('interview_advice'),intent('conversation',{reply:'Para a entrevista técnica de software, revise seus projetos e pratique explicar decisões de código.'})),[]);
 assert.ok(checkInterpretation(find('ambiguous_interview'),intent('conversation',{reply:'Prepare-se para Alfa.'})).includes('ambiguity'));
 assert.ok(checkInterpretation(find('current_correction'),intent('reschedule_appointment',{appointmentId:'wrong',datetime:'2026-10-30T16:00:00Z'})).includes('correction_state'));
 assert.ok(checkInterpretation(find('multiple_requests'),intent('assistant_plan',{reply:'Agendei tudo.',planSteps:[{action:'save_note',description:'Portfólio'}]})).includes('steps'));
 assert.ok(checkInterpretation(find('storage_opt_out'),intent('save_note')).includes('action'));
 assert.ok(checkInterpretation(find('current_correction'),intent('reschedule_appointment',{reply:'Alterei para as 16h.',appointmentId:'fixture-meeting',datetime:'2026-10-30T19:00:00Z'})).includes('false_execution'));
 assert.deepEqual(checkInterpretation(find('storage_opt_out'),intent('conversation',{reply:'Não salvei essa informação.'})),[]);
 assert.equal(fixtureContext(find('current_correction')).conversationState.focusedAppointment.version,3);
});
test('targeted repeat executes only selected cases and retains prior cumulative spending',async()=>{
 let calls=0;const r=await runEvaluation(options(async()=>{calls++;return response(intent('conversation'));},{caseIds:['storage_opt_out'],spentUsd:.0614096}));assert.equal(calls,1);assert.equal(r.total,1);assert.equal(r.priorSpentUsd,.0614096);assert.equal(r.cumulativeEstimatedCostUsd,.0614976);
 await assert.rejects(()=>runEvaluation(options(()=>assert.fail(),{caseIds:['invented']})),/invalid_cases/);
});
