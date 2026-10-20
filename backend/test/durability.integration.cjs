require("./register.cjs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { persistReminder } = require("../src/domain/reminder.creator.ts");
const { relaySchedules } = require("../src/domain/schedule.relay.ts");
const { deliverReminder } = require("../src/domain/reminder.delivery.ts");
const databaseUrl = require("./integration.database.cjs");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const numberId = "durability-" + randomUUID();
const phone = "5598" + String(Date.now()).slice(-11);
const input = { phone, title: "Internet", remindAt: "2099-07-20T10:00:00-03:00" };
before(async () => { await prisma.$connect(); });
async function clear() {
  await prisma.user.deleteMany({ where: { phone } });
  await prisma.incomingMessage.deleteMany({ where: { phoneNumberId: numberId } });
}
after(async () => { await clear(); await prisma.$disconnect(); });
async function create() {
  const source = await prisma.incomingMessage.create({
    data: { providerMessageId: randomUUID(), phoneNumberId: numberId, phone, text: "Internet" },
  });
  const reminder = await persistReminder(input, prisma, { phoneNumberId: numberId, sourceMessageId: source.id });
  return { source, reminder };
}
async function eligible(id) { await prisma.scheduleOutbox.update({ where: { reminderId: id }, data: { nextAttemptAt: new Date(0) } }); }
const accepted = async () => ({ messages: [{ id: "wamid.test-" + randomUUID() }] });

test("transação salva origem, lembrete e agendamento pendente", async () => {
  await clear();
  const { source, reminder } = await create();
  assert.equal(reminder.sourceMessageId, source.id);
  assert.equal(reminder.status, "scheduling_pending");
  const outbox = await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } });
  assert.equal(outbox.status, "pending");
  assert.equal(outbox.attempts, 0);
});
test("falha antes do commit desfaz usuário, lembrete e outbox", async () => {
  await clear();
  const store = {
    reminder: prisma.reminder,
    $transaction: callback => prisma.$transaction(async tx => { await callback(tx); throw Error("queda antes do commit"); }),
  };
  await assert.rejects(persistReminder(input, store, { phoneNumberId: numberId }), /antes do commit/);
  assert.equal(await prisma.user.count({ where: { phone } }), 0);
  assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 0);
  assert.equal(await prisma.scheduleOutbox.count({ where: { phoneNumberId: numberId } }), 0);
});
test("oito execuções concorrentes da mesma origem criam um lembrete e uma outbox", async () => {
  await clear();
  const source = await prisma.incomingMessage.create({ data: { providerMessageId: randomUUID(), phoneNumberId: numberId, phone, text: "Internet" } });
  const results = await Promise.all(Array.from({ length: 8 }, () => persistReminder(input, prisma, { phoneNumberId: numberId, sourceMessageId: source.id })));
  assert.equal(new Set(results.map(r => r.id)).size, 1);
  assert.equal(await prisma.scheduleOutbox.count({ where: { phoneNumberId: numberId } }), 1);
});
test("origem de outra pessoa ou número comercial é rejeitada", async () => {
  await clear();
  const { source } = await create();
  await assert.rejects(persistReminder({ ...input, phone: "5511999990001" }, prisma, { phoneNumberId: numberId, sourceMessageId: source.id }), /incompatível/);
  await assert.rejects(persistReminder(input, prisma, { phoneNumberId: "other", sourceMessageId: source.id }), /incompatível/);
});
test("queda após commit é recuperada sem reconstruir o lembrete", async () => {
  await clear();
  const { reminder } = await create();
  const restarted = new PrismaClient({ datasourceUrl: process.env.INBOX_TEST_DATABASE_URL });
  const jobs = [];
  try {
    await relaySchedules(restarted, { add: async (...args) => { jobs.push(args); } }, { phoneNumberId: numberId });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0][2].jobId, reminder.id);
    assert.equal((await prisma.reminder.findUnique({ where: { id: reminder.id } })).status, "scheduled");
    assert.equal(await prisma.reminder.count({ where: { user: { phone } } }), 1);
  } finally { await restarted.$disconnect(); }
});
test("falha da fila preserva tentativa e espera progressiva", async () => {
  await clear();
  const { reminder } = await create();
  const before = Date.now();
  await relaySchedules(prisma, { add: async () => { throw Error("redis"); } }, { phoneNumberId: numberId });
  const row = await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } });
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  assert.ok(row.nextAttemptAt.getTime() >= before + 30000);
  let calls = 0;
  await relaySchedules(prisma, { add: async () => { calls++; } }, { phoneNumberId: numberId });
  assert.equal(calls, 0);
});
test("aceitação da fila com resposta perdida é repetida com o mesmo jobId", async () => {
  await clear();
  const { reminder } = await create();
  const jobs = new Map();
  let first = true;
  const queue = { add: async (name, data, options) => {
    jobs.set(options.jobId, { name, data });
    if (first) { first = false; throw Error("ack perdido"); }
  } };
  await relaySchedules(prisma, queue, { phoneNumberId: numberId });
  await eligible(reminder.id);
  await relaySchedules(prisma, queue, { phoneNumberId: numberId });
  assert.equal(jobs.size, 1);
  const row = await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } });
  assert.equal(row.status, "published");
  assert.equal(row.attempts, 2);
});
test("dois publicadores concorrentes assumem uma pendência uma vez", async () => {
  await clear();
  await create();
  let calls = 0;
  const queue = { add: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); } };
  await Promise.all([relaySchedules(prisma, queue, { phoneNumberId: numberId }), relaySchedules(prisma, queue, { phoneNumberId: numberId })]);
  assert.equal(calls, 1);
});
test("publicação abandonada é recuperada sem reiniciar as tentativas", async () => {
  await clear();
  const { reminder } = await create();
  const row = await prisma.scheduleOutbox.update({
    where: { reminderId: reminder.id }, data: { status: "publishing", attempts: 2, leaseToken: "old-token", leaseUntil: new Date(0) },
  });
  await relaySchedules(prisma, { add: async () => {} }, { phoneNumberId: numberId });
  const result = await prisma.scheduleOutbox.findUnique({ where: { id: row.id } });
  assert.equal(result.attempts, 3);
  assert.equal(result.status, "published");
  const stale = await prisma.scheduleOutbox.updateMany({ where: { id: row.id, leaseToken: "old-token", status: "publishing" }, data: { status: "pending" } });
  assert.equal(stale.count, 0);
});
test("cinco tentativas persistentes encerram publicação mesmo após reiniciar cliente", async () => {
  await clear();
  const { reminder } = await create();
  let calls = 0;
  const queue = { add: async () => { calls++; throw Error("redis"); } };
  for (let attempt = 0; attempt < 5; attempt++) {
    await eligible(reminder.id);
    const client = new PrismaClient({ datasourceUrl: process.env.INBOX_TEST_DATABASE_URL });
    try { await relaySchedules(client, queue, { phoneNumberId: numberId }); }
    finally { await client.$disconnect(); }
  }
  await relaySchedules(prisma, queue, { phoneNumberId: numberId });
  const row = await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } });
  assert.equal(calls, 5);
  assert.equal(row.attempts, 5);
  assert.equal(row.status, "failed");
  assert.equal((await prisma.reminder.findUnique({ where: { id: reminder.id } })).status, "scheduling_failed");
});
test("queda na última tentativa não reinicia o limite ao recuperar", async () => {
  await clear();
  const { reminder } = await create();
  await prisma.scheduleOutbox.update({ where: { reminderId: reminder.id }, data: { status: "publishing", attempts: 5, leaseToken: "crashed", leaseUntil: new Date(0) } });
  await relaySchedules(prisma, { add: async () => assert.fail() }, { phoneNumberId: numberId });
  assert.equal((await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } })).status, "failed");
});
test("jobs duplicados no PostgreSQL só iniciam um envio", async () => {
  await clear();
  const { reminder } = await create();
  let sends = 0;
  const send = async () => { sends++; await new Promise(resolve => setTimeout(resolve, 10)); return accepted(); };
  await Promise.all([deliverReminder(reminder.id, numberId, prisma, send), deliverReminder(reminder.id, numberId, prisma, send)]);
  assert.equal(sends, 1);
  const row = await prisma.reminder.findUnique({ where: { id: reminder.id } });
  assert.equal(row.status, "provider_accepted");
  assert.match(row.providerMessageId, /wamid/);
});
test("envio aceito com resposta perdida não é repetido por novo job", async () => {
  await clear();
  const { reminder } = await create();
  let sends = 0;
  await assert.rejects(deliverReminder(reminder.id, numberId, prisma, async () => { sends++; throw Error("aceito, resposta perdida"); }));
  assert.equal((await prisma.reminder.findUnique({ where: { id: reminder.id } })).status, "delivery_unknown");
  assert.equal(await deliverReminder(reminder.id, numberId, prisma, async () => { sends++; return accepted(); }), "skipped");
  assert.equal(sends, 1);
});
test("publicação recuperada não regride o resultado de envio concluído", async () => {
  await clear();
  const { reminder } = await create();
  await deliverReminder(reminder.id, numberId, prisma, accepted);
  await relaySchedules(prisma, { add: async () => {} }, { phoneNumberId: numberId });
  assert.equal((await prisma.reminder.findUnique({ where: { id: reminder.id } })).status, "provider_accepted");
});

test("fila sem resposta tem prazo e preserva a publicação para recuperar", async () => {
  await clear();
  const { reminder } = await create();
  await relaySchedules(prisma, { add: () => new Promise(() => {}) }, { phoneNumberId: numberId, publishTimeoutMs: 10 });
  const row = await prisma.scheduleOutbox.findUnique({ where: { reminderId: reminder.id } });
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
});
