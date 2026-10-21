require("./register.cjs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHmac } = require("node:crypto");
const { createPrismaClient } = require("../src/config/database.ts");
const { receiveMessages } = require("../src/domain/inbox.receiver.ts");
const { processInboxBatch } = require("../src/domain/inbox.processor.ts");
const { relayReplies } = require("../src/domain/reply.relay.ts");
const { relaySchedules } = require("../src/domain/schedule.relay.ts");
const { createWebhookRouter } = require("../src/http/webhook.handlers.ts");
const express = require("express");
const databaseUrl = require("./integration.database.cjs");
const prisma = createPrismaClient(databaseUrl);
const numberId = "integration-" + randomUUID();
const phone = "5599" + String(Date.now()).slice(-11);
const interpretation = { action: "create_reminder", title: "Pagar internet", datetime: "2099-07-20T10:00:00-03:00", description: null, amount: null, category: null, reply: "não usar como confirmação" };
const deps = { buildContext: async () => ({}), interpret: async () => interpretation };
const payload = (...ids) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: numberId },
    messages: ids.map(id => ({ id, from: phone, type: "text", text: { body: "Pagar internet dia 20/07/2099 às 10h" } })),
  } }] }],
});
before(async () => { await prisma.$connect(); });
async function clear() {
  await prisma.user.deleteMany({ where: { phone } });
  await prisma.incomingMessage.deleteMany({ where: { phoneNumberId: numberId } });
}
after(async () => { await clear(); await prisma.$disconnect(); });
test("PostgreSQL: lote e reentrega preservam uma única identidade", async () => {
  await clear();
  assert.equal((await receiveMessages(payload("same", "same"), numberId, prisma.incomingMessage)).count, 1);
  assert.equal((await receiveMessages(payload("same"), numberId, prisma.incomingMessage)).count, 0);
});
test("PostgreSQL: doze recepções simultâneas inserem uma única mensagem", async () => {
  await clear();
  const results = await Promise.all(Array.from({ length: 12 }, () => receiveMessages(payload("concurrent"), numberId, prisma.incomingMessage)));
  assert.equal(results.reduce((sum, r) => sum + r.count, 0), 1);
});
test("PostgreSQL: workers concorrentes preparam uma ação e uma resposta", async () => {
  await clear();
  await receiveMessages(payload("workers"), numberId, prisma.incomingMessage);
  await prisma.incomingMessage.updateMany({ where: { phoneNumberId: numberId }, data: { nextAttemptAt: new Date(0) } });
  let calls = 0;
  const countingDeps = { ...deps, interpret: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return interpretation; } };
  await Promise.all([processInboxBatch(prisma, countingDeps, numberId), processInboxBatch(prisma, countingDeps, numberId)]);
  assert.equal(calls, 1);
  assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 1);
  assert.equal(await prisma.replyOutbox.count({ where: { message: { phoneNumberId: numberId } } }), 1);
});
test("PostgreSQL: interpretação inválida não executa ação e respeita espera", async () => {
  await clear();
  await receiveMessages(payload("invalid-ai"), numberId, prisma.incomingMessage);
  await prisma.incomingMessage.updateMany({ where: { phoneNumberId: numberId }, data: { nextAttemptAt: new Date(0) } });
  let calls = 0;
  const invalid = { ...deps, interpret: async () => { calls++; return { ...interpretation, action: "delete_all" }; } };
  await processInboxBatch(prisma, invalid, numberId);
  await processInboxBatch(prisma, invalid, numberId);
  const row = await prisma.incomingMessage.findFirst({ where: { phoneNumberId: numberId } });
  assert.equal(calls, 1);
  assert.equal(row.status, "received");
  assert.equal(row.interpretationAttempts, 1);
  assert.equal(row.lastError, "interpreting_failed");
  assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 0);
});
test("PostgreSQL: processamento legado incerto não é retomado automaticamente", async () => {
  await clear();
  await receiveMessages(payload("legacy"), numberId, prisma.incomingMessage);
  await prisma.incomingMessage.updateMany({ where: { phoneNumberId: numberId }, data: { status: "processing", startedAt: new Date() } });
  assert.equal(await processInboxBatch(prisma, { ...deps, interpret: async () => assert.fail() }, numberId), 0);
});
test("PostgreSQL: falha no commit não deixa ação ou resposta pela metade", async () => {
  await clear();
  await receiveMessages(payload("rollback"), numberId, prisma.incomingMessage);
  await prisma.incomingMessage.updateMany({ where: { phoneNumberId: numberId }, data: { nextAttemptAt: new Date(0) } });
  const store = { incomingMessage: prisma.incomingMessage, $transaction: callback => prisma.$transaction(async tx => {
    await callback(tx); throw Error("falha antes de commit");
  }) };
  await processInboxBatch(store, deps, numberId);
  assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 0);
  assert.equal(await prisma.replyOutbox.count({ where: { message: { phoneNumberId: numberId } } }), 0);
  const row = await prisma.incomingMessage.findFirst({ where: { phoneNumberId: numberId } });
  assert.equal(row.status, "interpreted");
  assert.deepEqual(row.interpretation, interpretation);
  await prisma.incomingMessage.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
  await processInboxBatch(prisma, { ...deps, interpret: async () => assert.fail() }, numberId);
  assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 1);
  assert.equal(await prisma.replyOutbox.count({ where: { message: { phoneNumberId: numberId } } }), 1);
});
test("HTTP + PostgreSQL: reentregas geram um lembrete, um job e uma resposta", async () => {
  await clear();
  const app = express();
  const secret = "integration-secret";
  app.use(createWebhookRouter(prisma.incomingMessage, () => ({ appSecret: secret, phoneNumberId: numberId })));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const body = JSON.stringify(payload("full-flow"));
  try {
    const url = "http://127.0.0.1:" + server.address().port + "/webhook";
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    for (let i = 0; i < 3; i++) assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body })).status, 200);
    await prisma.incomingMessage.updateMany({ where: { phoneNumberId: numberId }, data: { nextAttemptAt: new Date(0) } });
    await processInboxBatch(prisma, deps, numberId);
    const jobs = [], replies = [];
    await relaySchedules(prisma, { add: async (...args) => { jobs.push(args); } }, { phoneNumberId: numberId });
    const send = async (_, text) => { replies.push(text); return { messages: [{ id: "wamid.reply" }] }; };
    await relayReplies(prisma, send, numberId);
    await relayReplies(prisma, send, numberId);
    assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 1);
    assert.equal(jobs.length, 1);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Combinado/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
