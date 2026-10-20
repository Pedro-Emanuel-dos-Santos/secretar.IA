require("./register.cjs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createPrismaClient } = require("../src/config/database.ts");
const { processInboxBatch } = require("../src/domain/inbox.processor.ts");
const { relayReplies } = require("../src/domain/reply.relay.ts");
const { relaySchedules } = require("../src/domain/schedule.relay.ts");
const { operationalOverview } = require("../src/domain/operations.overview.ts");
const databaseUrl = require("./integration.database.cjs");
const prisma = createPrismaClient(databaseUrl);
const numberId = "replies-" + randomUUID();
const phone = "5597" + String(Date.now()).slice(-11);
const intent = { action: "create_reminder", title: "Conteúdo privado", datetime: "2099-07-20T10:00:00-03:00", description: null, amount: null, category: null, reply: "Não usar para confirmar execução." };
const deps = { buildContext: async message => ({ receivedAt: message.receivedAt }), interpret: async () => intent };
const neverInterpret = { ...deps, interpret: async () => assert.fail("Não deveria chamar IA novamente") };
const accepted = async () => ({ messages: [{ id: "wamid.reply-" + randomUUID() }] });
before(async () => { await prisma.$connect(); });
async function clear() {
  await prisma.user.deleteMany({ where: { phone } });
  await prisma.incomingMessage.deleteMany({ where: { phoneNumberId: numberId } });
}
after(async () => { await clear(); await prisma.$disconnect(); });
async function incoming(data = {}) {
  return prisma.incomingMessage.create({ data: { phoneNumberId: numberId, phone, text: "Texto privado", providerMessageId: randomUUID(), nextAttemptAt: new Date(0), ...data } });
}
async function prepare() {
  const row = await incoming();
  await processInboxBatch(prisma, deps, numberId);
  return prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id }, include: { reply: true, reminder: true } });
}

test('recusa conhecida da Meta fica visível sem reenviar nem guardar texto privado do erro',async()=>{
 await clear();const row=await prepare();let sends=0;
 const {WhatsAppSendRejected}=require('../src/domain/whatsapp.errors.ts');
 await relayReplies(prisma,async()=>{sends++;throw new WhatsAppSendRejected(400,131030)},numberId);
 await relayReplies(prisma,()=>assert.fail(),numberId);
 const result=await prisma.incomingMessage.findUniqueOrThrow({where:{id:row.id},include:{reply:true}});
 assert.equal(result.status,'reply_rejected');assert.equal(result.reply.status,'provider_rejected');
 assert.deepEqual(result.reply.deliveryErrorCodes,[131030]);assert.equal(sends,1);
 assert.equal((await operationalOverview(prisma,numberId)).attention.rejectedReplies,1);
});

test("snapshot persistido retoma a ação sem consultar IA", async () => {
  await clear();
  const row = await incoming({ status: "interpreted", interpretation: intent });
  await processInboxBatch(prisma, neverInterpret, numberId);
  const result = await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id }, include: { reminder: true, reply: true } });
  assert.equal(result.status, "reply_pending");
  assert.equal(result.interpretationAttempts, 0);
  assert.ok(result.reminder);
  assert.ok(result.reply);
});
test("resposta pendente é recuperada por outro cliente sem repetir a ação", async () => {
  await clear();
  const row = await prepare();
  const client = createPrismaClient(databaseUrl);
  let sends = 0;
  try {
    const send = async () => { sends++; return accepted(); };
    await relayReplies(client, send, numberId);
    await processInboxBatch(client, neverInterpret, numberId);
    await relayReplies(client, send, numberId);
    assert.equal(sends, 1);
    assert.equal(await prisma.reminder.count({ where: { sourceMessageId: row.id } }), 1);
    assert.equal((await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } })).status, "completed");
  } finally { await client.$disconnect(); }
});
test("interpretador interrompido tem tentativa recuperável sem zerar contador", async () => {
  await clear();
  const row = await incoming({ status: "interpreting", interpretationAttempts: 1, leaseToken: "old", leaseUntil: new Date(0) });
  await processInboxBatch(prisma, deps, numberId);
  const result = await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(result.interpretationAttempts, 2);
  assert.equal(result.status, "reply_pending");
});
test("ação interrompida antes da transação é recuperada com o snapshot", async () => {
  await clear();
  const row = await incoming({ status: "executing", interpretation: intent, executionAttempts: 1, leaseToken: "old", leaseUntil: new Date(0) });
  await processInboxBatch(prisma, neverInterpret, numberId);
  const result = await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(result.executionAttempts, 2);
  assert.equal(result.status, "reply_pending");
  const stale = await prisma.incomingMessage.updateMany({ where: { id: row.id, status: "executing", leaseToken: "old" }, data: { status: "interpreted" } });
  assert.equal(stale.count, 0);
});
test("última tentativa abandonada não reinicia limite de interpretação", async () => {
  await clear();
  const row = await incoming({ status: "interpreting", interpretationAttempts: 5, leaseToken: "crashed", leaseUntil: new Date(0) });
  await processInboxBatch(prisma, neverInterpret, numberId);
  const result = await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(result.status, "reply_pending");
  assert.match((await prisma.replyOutbox.findUniqueOrThrow({where:{messageId:row.id}})).text,/Não consegui entender/);
  assert.equal(result.interpretationAttempts, 5);
});
test("última tentativa abandonada não reinicia limite de execução", async () => {
  await clear();
  const row = await incoming({ status: "executing", interpretation: intent, executionAttempts: 5, leaseToken: "crashed", leaseUntil: new Date(0) });
  await processInboxBatch(prisma, neverInterpret, numberId);
  assert.equal((await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } })).status, "reply_pending");
  assert.match((await prisma.replyOutbox.findUniqueOrThrow({where:{messageId:row.id}})).text,/Não consegui confirmar/);
  assert.equal(await prisma.reminder.count({ where: { sourceMessageId: row.id } }), 0);
});
test('tentativa esgotada em estado pronto gera uma resposta de falha uma única vez',async()=>{
 await clear();const row=await incoming({status:'received',interpretationAttempts:5});
 await processInboxBatch(prisma,neverInterpret,numberId);await processInboxBatch(prisma,neverInterpret,numberId);
 assert.equal(await prisma.replyOutbox.count({where:{messageId:row.id}}),1);
 assert.equal(await prisma.reminder.count({where:{sourceMessageId:row.id}}),0);
});
test("dois remetentes de resposta disputam o mesmo registro uma vez", async () => {
  await clear();
  const row = await prepare();
  let sends = 0;
  const send = async () => { sends++; await new Promise(resolve => setTimeout(resolve, 10)); return accepted(); };
  await Promise.all([relayReplies(prisma, send, numberId), relayReplies(prisma, send, numberId)]);
  assert.equal(sends, 1);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).attempts, 1);
});
test("resposta aceita com conexão perdida não é repetida", async () => {
  await clear();
  const row = await prepare();
  let sends = 0;
  const send = async () => { sends++; throw Error("aceitação simulada com resposta perdida"); };
  await relayReplies(prisma, send, numberId);
  await relayReplies(prisma, send, numberId);
  await processInboxBatch(prisma, neverInterpret, numberId);
  assert.equal(sends, 1);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).status, "delivery_unknown");
  assert.equal((await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } })).status, "reply_unknown");
  assert.equal(await prisma.reminder.count({ where: { sourceMessageId: row.id } }), 1);
});
test("resposta sem identidade do provedor não confirma aceitação", async () => {
  await clear();
  const row = await prepare();
  await relayReplies(prisma, async () => ({}), numberId);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).status, "delivery_unknown");
});
test("resposta marcada em envio antes de queda não é repetida", async () => {
  await clear();
  const row = await prepare();
  await prisma.$transaction([
    prisma.replyOutbox.update({ where: { messageId: row.id }, data: { status: "sending", startedAt: new Date(0), attempts: 1 } }),
    prisma.incomingMessage.update({ where: { id: row.id }, data: { status: "reply_sending" } }),
  ]);
  await relayReplies(prisma, async () => assert.fail(), numberId);
  assert.equal((await operationalOverview(prisma, numberId)).attention.uncertainReplies, 1);
});
test("commit confirmado no banco e resposta do banco perdida não reenvia", async () => {
  await clear();
  const row = await prepare();
  let transactions = 0, sends = 0;
  const store = {
    replyOutbox: prisma.replyOutbox,
    $transaction: async callback => {
      const result = await prisma.$transaction(callback);
      transactions++;
      if (transactions === 2) throw Error("resposta perdida após commit de aceitação");
      return result;
    },
  };
  await relayReplies(store, async () => { sends++; return accepted(); }, numberId);
  await relayReplies(prisma, async () => { sends++; return accepted(); }, numberId);
  assert.equal(sends, 1);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).status, "provider_accepted");
  assert.equal((await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } })).status, "completed");
});
test("queda após assumir envio deixa registro para investigação", async () => {
  await clear();
  const row = await prepare();
  const store = {
    replyOutbox: prisma.replyOutbox,
    $transaction: async callback => { await prisma.$transaction(callback); throw Error("queda após assumir"); },
  };
  await assert.rejects(relayReplies(store, async () => assert.fail(), numberId));
  await relayReplies(prisma, async () => assert.fail(), numberId);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).status, "sending");
});
test("texto final é atualizado com agendamento confirmado antes do envio", async () => {
  await clear();
  const row = await prepare();
  assert.match(row.reply.text, /ainda não foi confirmado/);
  await relaySchedules(prisma, { add: async () => {} }, { phoneNumberId: numberId });
  let text;
  await relayReplies(prisma, async (_, body) => { text = body; return accepted(); }, numberId);
  assert.match(text, /Combinado/);
  assert.doesNotMatch(text, /ainda não foi confirmado/);
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).text, text);
});
test("fila indisponível não faz a resposta prometer agendamento", async () => {
  await clear();
  const row = await prepare();
  await relaySchedules(prisma, { add: async () => { throw Error("redis"); } }, { phoneNumberId: numberId });
  let text;
  await relayReplies(prisma, async (_, body) => { text = body; return accepted(); }, numberId);
  assert.match(text, /ainda não foi confirmado/);
  await prisma.scheduleOutbox.update({ where: { reminderId: row.reminder.id }, data: { nextAttemptAt: new Date(0) } });
  await relaySchedules(prisma, { add: async () => {} }, { phoneNumberId: numberId });
  assert.equal((await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } })).text, text);
});
test("pergunta por informação ausente fica persistida sem criar lembrete", async () => {
  await clear();
  const row = await incoming();
  await processInboxBatch(prisma, { ...deps, interpret: async () => ({ ...intent, datetime: null }) }, numberId);
  const reply = await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: row.id } });
  assert.match(reply.text, /dia e horário/);
  assert.equal(reply.refreshReminder, false);
  assert.equal(await prisma.reminder.count({ where: { sourceMessageId: row.id } }), 0);
});
test("operação devolve apenas contagens e respeita o número comercial", async () => {
  await clear();
  const row = await prepare();
  const overview = await operationalOverview(prisma, numberId);
  assert.equal(overview.inbox.reply_pending, 1);
  assert.equal(overview.replies.pending, 1);
  const serialized = JSON.stringify(overview);
  for (const value of [phone, row.id, intent.title, "Texto privado"]) assert.equal(serialized.includes(value), false);
  const other = await operationalOverview(prisma, "other-" + numberId);
  assert.deepEqual(other.inbox, {});
  assert.deepEqual(other.replies, {});
  await relayReplies(prisma, async () => assert.fail(), "other-" + numberId);
});
test("atraso local mantém o horário original no contexto", async () => {
  await clear();
  const receivedAt = new Date("2026-10-18T10:00:00-03:00");
  await incoming({ receivedAt });
  await processInboxBatch(prisma, {
    buildContext: async message => { assert.equal(message.receivedAt.toISOString(), receivedAt.toISOString()); return {}; },
    interpret: async () => intent,
  }, numberId);
});

test("resultado tardio de interpretador antigo não substitui snapshot recuperado", { timeout: 10000 }, async () => {
  await clear();
  const row = await incoming();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const old = processInboxBatch(prisma, { ...deps, interpret: async () => { entered(); await gate; return intent; } }, numberId);
  await started;
  await prisma.incomingMessage.update({ where: { id: row.id }, data: { leaseUntil: new Date(0) } });
  const recoveredIntent = { ...intent, title: "Snapshot recuperado" };
  await processInboxBatch(prisma, { ...deps, interpret: async () => recoveredIntent }, numberId);
  release();
  await old;
  const result = await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id }, include: { reminder: true } });
  assert.equal(result.interpretation.title, recoveredIntent.title);
  assert.equal(result.reminder.title, recoveredIntent.title);
  assert.equal(await prisma.replyOutbox.count({ where: { messageId: row.id } }), 1);
});

test("executor antigo perde a posse antes da transação e não repete ação", { timeout: 10000 }, async () => {
  await clear();
  const row = await incoming({ status: "interpreted", interpretation: intent });
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const delayedStore = {
    incomingMessage: prisma.incomingMessage,
    $transaction: async callback => { entered(); await gate; return prisma.$transaction(callback); },
  };
  const old = processInboxBatch(delayedStore, neverInterpret, numberId);
  await started;
  await prisma.incomingMessage.update({ where: { id: row.id }, data: { leaseUntil: new Date(0) } });
  await processInboxBatch(prisma, neverInterpret, numberId);
  release();
  await old;
  assert.equal(await prisma.reminder.count({ where: { sourceMessageId: row.id } }), 1);
  assert.equal(await prisma.replyOutbox.count({ where: { messageId: row.id } }), 1);
  assert.equal((await prisma.incomingMessage.findUniqueOrThrow({ where: { id: row.id } })).executionAttempts, 2);
});

test("envio recém-iniciado aparece no estado, mas não como travado", async () => {
  await clear();
  const row = await prepare();
  await prisma.replyOutbox.update({ where: { messageId: row.id }, data: { status: "sending", startedAt: new Date() } });
  const overview = await operationalOverview(prisma, numberId);
  assert.equal(overview.replies.sending, 1);
  assert.equal(overview.attention.uncertainReplies, 0);
});
