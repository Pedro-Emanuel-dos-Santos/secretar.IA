require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Lifecycle, WorkGroup, shutdownPolicy } = require('../src/runtime/lifecycle.ts');
const { HttpDrain } = require('../src/runtime/http.drain.ts');
const delay = ms => new Promise(r => setTimeout(r, ms));
test('Railway budget absent/zero/short/invalid is refused before resources', () => {
  for (const value of [undefined,'0','30','abc','-1','Infinity']) {
    assert.throws(() => shutdownPolicy('api',{RAILWAY_SERVICE_ID:'fixture',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:value}),/railway_shutdown_budget/);
  }
  assert.equal(shutdownPolicy('reminders',{RAILWAY_SERVICE_ID:'fixture',SHUTDOWN_TIMEOUT_MS:'60000',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'75'}).timeoutMs,60000);
  assert.equal(shutdownPolicy('api',{RAILWAY_SERVICE_ID:'fixture',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'45'}).timeoutMs,30000);
  assert.equal(shutdownPolicy('inbox',{RAILWAY_SERVICE_ID:'fixture',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'150'}).timeoutMs,120000);
});
test('invalid local deadline is rejected', () => {
  for(const value of ['0','NaN','-1','300001','0.5'])assert.throws(()=>shutdownPolicy('api',{SHUTDOWN_TIMEOUT_MS:value}),/shutdown_timeout/);
});
test('drain waits for real work and closes resources in reverse dependency order once', async () => {
  let release; const gate=new Promise(r=>release=r), events=[], exits=[];
  const life=new Lifecycle('api',{env:{},signals:false,log:()=>{},exit:c=>exits.push(c)});
  life.onClose(()=>events.push('db'));life.onClose(()=>events.push('queue'));
  life.run(async()=>{await gate;events.push('committed')});
  const stopped=life.stop('SIGTERM');assert.equal(stopped,life.stop('SIGINT'));
  await delay(10);assert.deepEqual(events,[]);release();await stopped;
  assert.deepEqual(events,['committed','queue','db']);assert.deepEqual(exits,[0]);
});
test('resources discovered during startup are drained before disconnect', async()=>{
  let release;const gate=new Promise(r=>release=r),events=[];
  const life=new Lifecycle('api',{env:{},signals:false,log:()=>{},exit:()=>{}});
  life.run(async()=>{await gate;life.onClose(()=>events.push('close'));life.onDrain(async()=>{await delay(5);events.push('drain')});});
  const stopped=life.stop('SIGTERM');release();await stopped;assert.deepEqual(events,['drain','close']);
});
test('cleanup failure cannot report clean success',async()=>{
  const exits=[],logs=[];const life=new Lifecycle('api',{env:{},signals:false,log:e=>logs.push(e),exit:c=>exits.push(c)});
  life.onClose(()=>{throw Error('private detail must not log')});await life.stop('SIGTERM');
  assert.deepEqual(exits,[1]);assert.equal(logs.at(-1).clean,false);assert.ok(!JSON.stringify(logs).includes('private detail'));
});
test('deadline exits failed without disconnecting an active operation',async()=>{
  const exits=[],closed=[];let release;const gate=new Promise(r=>release=r);
  const life=new Lifecycle('api',{env:{SHUTDOWN_TIMEOUT_MS:'30'},signals:false,log:()=>{},exit:c=>exits.push(c)});
  life.run(()=>gate);life.onClose(()=>closed.push(true));const stopped=life.stop('SIGTERM');
  await delay(55);assert.deepEqual(exits,[1]);assert.deepEqual(closed,[]);release();await stopped;assert.deepEqual(closed,[]);
});
test('sleep/schema polling wakes immediately on shutdown',async()=>{
  const life=new Lifecycle('inbox',{env:{},signals:false,log:()=>{},exit:()=>{}});
  const waiting=life.wait(10000);await life.stop('SIGINT');await waiting;
});
test('HTTP tracks handler promise after client socket closes and rejects new admissions',async()=>{
  const drain=new HttpDrain();let release;const gate=new Promise(r=>release=r);let calls=0;
  const handler=drain.handler(async()=>{calls++;await gate});const pending=handler({app:{locals:{}}},{},()=>{});
  drain.begin();assert.equal(drain.work.size,1);
  let status;const res={set(){return this},status(s){status=s;return this},json(){return this}};
  handler({app:{locals:{}}},res,()=>{});assert.equal(status,503);await delay(1);assert.equal(calls,1);
  release();await pending;await drain.work.waitForIdle();assert.equal(drain.work.size,0);
});
test('work failure releases its slot while preserving rejection',async()=>{
  const group=new WorkGroup();await assert.rejects(group.run(()=>{throw Error('fixture')}));await group.waitForIdle();assert.equal(group.size,0);
});
