const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const express = require("express");
const { verifySignature, verifyChallenge } = require("../src/domain/webhook.security.ts");
const { extractMessages, receiveMessages } = require("../src/domain/inbox.receiver.ts");
const { createWebhookRouter } = require("../src/http/webhook.handlers.ts");
const { createAdminGuard } = require("../src/http/admin.guard.ts");
const secret = "test-app-secret";
const numberId = "test-phone-id";
const message = id => ({ id, from: "5511999990000", type: "text", text: { body: "me lembra amanhã às dez" } });
const change = (...ids) => ({ field: "messages", value: { metadata: { phone_number_id: numberId }, messages: ids.map(message) } });
const payload = (...ids) => ({ object: "whatsapp_business_account", entry: [{ changes: [change(...ids)] }] });
const sign = body => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

function memoryInbox() {
  const rows = new Map();
  return {
    rows,
    async createMany({ data }) {
      let count = 0;
      for (const item of data) {
        const key = item.phoneNumberId + ":" + item.providerMessageId;
        if (!rows.has(key)) { rows.set(key, { ...item, id: key, status: "received", receivedAt: new Date() }); count++; }
      }
      return { count };
    },
    async findMany({ where }) { return [...rows.values()].filter(row => row.status === where.status && row.phoneNumberId === where.phoneNumberId); },
    async updateMany({ where, data }) {
      const row = [...rows.values()].find(row => row.id === where.id && row.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
}

test("assinatura usa bytes originais e rejeita corpo alterado", () => {
  const raw = Buffer.from('{ "text": "olá" }');
  assert.equal(verifySignature(raw, sign(raw), secret), true);
  assert.equal(verifySignature(Buffer.from('{"text":"olá"}'), sign(raw), secret), false);
  for (const signature of [undefined, "sha256=00", "sha256=" + "g".repeat(64), ["header"], "sha256=" + "0".repeat(64)]) assert.equal(verifySignature(raw, signature, secret), false);
  assert.equal(verifySignature(raw, sign(raw), ""), false);
});
test("verificação GET exige token configurado e desafio simples", () => {
  const query = { "hub.mode": "subscribe", "hub.verify_token": "verify", "hub.challenge": "123" };
  assert.equal(verifyChallenge(query, "verify"), "123");
  assert.equal(verifyChallenge(query, undefined), null);
  assert.equal(verifyChallenge({ ...query, "hub.verify_token": ["verify"] }, "verify"), null);
  assert.equal(verifyChallenge({ ...query, "hub.challenge": {} }, "verify"), null);
});
test("percorre todas as entradas, alterações e mensagens", () => {
  const data = payload("1", "2");
  data.entry[0].changes.push(change("3"));
  data.entry.push({ changes: [change("4", "5")] });
  assert.deepEqual(extractMessages(data, numberId).map(m => m.providerMessageId), ["1", "2", "3", "4", "5"]);
});
test("ignora status, imagem e destinatário diferente", () => {
  const data = payload();
  data.entry[0].changes[0].value.messages.push({ type: "image" });
  data.entry[0].changes.push({ field: "messages", value: { metadata: { phone_number_id: numberId }, statuses: [{}] } });
  const other = change("other");
  other.value.metadata.phone_number_id = "different";
  data.entry[0].changes.push(other);
  assert.deepEqual(extractMessages(data, numberId), []);
});
test("valida o lote inteiro antes de persistir", async () => {
  let writes = 0;
  const data = payload("valid", "invalid");
  data.entry[0].changes[0].value.messages[1].from = "bad";
  await assert.rejects(receiveMessages(data, numberId, { createMany: async () => { writes++; return { count: 1 }; } }));
  assert.equal(writes, 0);
});
test("reentregas e repetições no lote não criam novas entradas", async () => {
  const store = memoryInbox();
  assert.equal((await receiveMessages(payload("same", "same"), numberId, store)).count, 1);
  assert.equal((await receiveMessages(payload("same"), numberId, store)).count, 0);
  assert.equal(store.rows.size, 1);
});
async function withServer(store, config, run) {
  const app = express();
  app.use(createWebhookRouter(store, () => config));
  app.use(express.json());
  app.post("/reminders", createAdminGuard(() => config.adminToken), (_, res) => res.sendStatus(201));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try { await run("http://127.0.0.1:" + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const configuration = { appSecret: secret, verifyToken: "verify", phoneNumberId: numberId, adminToken: "admin-test" };
const post = (url, body, signature = sign(Buffer.from(body))) => fetch(url + "/webhook", {
  method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body,
});
test("HTTP persiste antes de responder e aceita reentrega sem duplicação", async () => {
  const store = memoryInbox();
  await withServer(store, configuration, async url => {
    const body = JSON.stringify(payload("http"));
    assert.equal((await post(url, body)).status, 200);
    assert.equal(store.rows.size, 1);
    assert.equal((await post(url, body)).status, 200);
    assert.equal(store.rows.size, 1);
  });
});
test("HTTP só confirma o recebimento após o banco concluir", async () => {
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = { createMany: async () => { entered(); await gate; return { count: 1 }; } };
  await withServer(store, configuration, async url => {
    let responded = false;
    const request = post(url, JSON.stringify(payload("durable-ack"))).then(response => { responded = true; return response; });
    await started;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(responded, false);
    release();
    assert.equal((await request).status, 200);
  });
});
test("HTTP sem assinatura válida não escreve no banco", async () => {
  const store = memoryInbox();
  await withServer(store, configuration, async url => {
    assert.equal((await post(url, JSON.stringify(payload("bad")), "sha256=00")).status, 401);
    assert.equal(store.rows.size, 0);
  });
});
test("HTTP sem segredo configurado fecha a entrada", async () => {
  const store = memoryInbox();
  await withServer(store, {}, async url => {
    assert.equal((await post(url, JSON.stringify(payload("bad")))).status, 503);
    assert.equal(store.rows.size, 0);
  });
});
test("HTTP falha ao persistir retorna 503 para permitir reentrega", async () => {
  await withServer({ createMany: async () => { throw Error("db"); } }, configuration, async url => {
    assert.equal((await post(url, JSON.stringify(payload("retry")))).status, 503);
  });
});
test("HTTP JSON inválido e lote malformado não são aceitos", async () => {
  await withServer(memoryInbox(), configuration, async url => {
    assert.equal((await post(url, "{")).status, 400);
    assert.equal((await post(url, "{}")).status, 400);
  });
});
test("HTTP verificação GET usa token do ambiente e devolve desafio sem JSON", async () => {
  await withServer(memoryInbox(), configuration, async url => {
    const response = await fetch(url + "/webhook?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "123");
    assert.equal((await fetch(url + "/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123")).status, 403);
  });
});
test("HTTP API interna exige bearer configurado", async () => {
  await withServer(memoryInbox(), configuration, async url => {
    assert.equal((await fetch(url + "/reminders", { method: "POST" })).status, 401);
    assert.equal((await fetch(url + "/reminders", { method: "POST", headers: { authorization: "Bearer admin-test" } })).status, 201);
  });
  await withServer(memoryInbox(), {}, async url => {
    assert.equal((await fetch(url + "/reminders", { method: "POST", headers: { authorization: "Bearer admin-test" } })).status, 503);
  });
});
