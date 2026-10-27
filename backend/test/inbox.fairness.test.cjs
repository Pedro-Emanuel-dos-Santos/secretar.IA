require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processInboxBatch } = require("../src/domain/inbox.processor.ts");

test("lote continua após vinte mensagens do contato bloqueado por retry anterior", async () => {
  const rows = Array.from({length:20},(_,i)=>({id:`a-${i}`,phone:"A",text:"continuação",receivedAt:new Date(1000+i),status:"received"}));
  rows.push({id:"b",phone:"B",text:"me lembra de pagar",receivedAt:new Date(2000),status:"received",interpretationAttempts:0,maxAttempts:5});
  const claims=[];
  const store={incomingMessage:{
    findMany:async({where,take})=>rows.filter(r=>!(where.id?.notIn||[]).includes(r.id)&&!(where.phone?.notIn||[]).includes(r.phone)).slice(0,take),
    findFirst:async({where})=>where.phone==="A"?{id:"retry-a"}:null,
    updateMany:async({where})=>{claims.push(where.id);return {count:0};},
    findUnique:async()=>null,
  }};
  await processInboxBatch(store,{interpret:async()=>assert.fail("claim perdido não deve chamar IA")},"business");
  assert.deepEqual(claims,["b"]);
});

test("varredura de contatos bloqueados respeita limite de cinco páginas", async () => {
  let pages=0;
  const store={incomingMessage:{
    findMany:async()=>{const page=pages++;return Array.from({length:20},(_,i)=>({id:`${page}-${i}`,phone:`${page}-${i}`,text:"continuação",receivedAt:new Date(page*20+i),status:"received"}));},
    findFirst:async()=>({id:"anterior"}),
  }};
  assert.equal(await processInboxBatch(store,{},"business"),0);
  assert.equal(pages,5);
});
