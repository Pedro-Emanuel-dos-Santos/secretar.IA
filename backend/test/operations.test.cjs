const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createOperationsRouter } = require("../src/http/operations.handlers.ts");

async function serverFor(config, run, failure = false) {
  let calls = 0;
  const groupBy = async () => { calls++; if (failure) throw Error("conteúdo privado"); return []; };
  const store = { incomingMessage: { groupBy, count: async () => 0 }, replyOutbox: { groupBy, count: async () => 0 },
    scheduleOutbox: { groupBy }, reminder: { groupBy, count: async () => 0 } };
  const app = express();
  app.use("/operations", createOperationsRouter(store, config));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try { await run("http://127.0.0.1:" + server.address().port + "/operations", () => calls); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const config = { adminToken: () => "test-admin", phoneNumberId: () => "number" };
const auth = { headers: { authorization: "Bearer test-admin" } };

test("operações sem autenticação não chegam ao banco", async () => {
  await serverFor(config, async (url, calls) => {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer wrong" } })).status, 401);
    assert.equal(calls(), 0);
    const response = await fetch(url, auth);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).inbox, {});
  });
});
test("operações fecham quando falta token ou número comercial", async () => {
  await serverFor({ ...config, adminToken: () => undefined }, async (url, calls) => {
    assert.equal((await fetch(url, auth)).status, 503); assert.equal(calls(), 0);
  });
  await serverFor({ ...config, phoneNumberId: () => undefined }, async (url, calls) => {
    assert.equal((await fetch(url, auth)).status, 503); assert.equal(calls(), 0);
  });
});
test("falha no resumo operacional não expõe erro interno", async () => {
  await serverFor(config, async url => {
    const response = await fetch(url, auth);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /conteúdo privado/);
  }, true);
});
