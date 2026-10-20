require("./register.cjs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createPrismaClient } = require("../src/config/database.ts");
const { persistReminder } = require("../src/domain/reminder.creator.ts");
const { manageReminders } = require("../src/domain/reminder.management.ts");
const { deliverReminder } = require("../src/domain/reminder.delivery.ts");
const { relaySchedules } = require("../src/domain/schedule.relay.ts");
const { relayReplies } = require("../src/domain/reply.relay.ts");
const { processInboxBatch } = require("../src/domain/inbox.processor.ts");
const { conversationContext } = require("../src/domain/conversation.context.ts");
const databaseUrl = require("./integration.database.cjs");
const prisma = createPrismaClient(databaseUrl);
const business = "management-" + randomUUID(), otherBusiness = business + "-other";
const phone = "5596" + String(Date.now()).slice(-11), otherPhone = "5595" + String(Date.now()).slice(-11);
const intent = (action, fields = {}) => ({ action, title: null, description: null, datetime: null, amount: null, category: null, reply: "texto interno", ...fields });
before(async () => { await prisma.$connect(); });
async function clear() {
  await prisma.user.deleteMany({ where: { phone: { in: [phone, otherPhone] } } });
  await prisma.incomingMessage.deleteMany({ where: { phoneNumberId: { in: [business, otherBusiness] } } });
}
after(async () => { await clear(); await prisma.$disconnect(); });
async function make(title = "Internet", options = {}) {
  const owner = options.phone ?? phone, numberId = options.business ?? business;
  const source = await prisma.incomingMessage.create({ data: {
    providerMessageId: randomUUID(), phoneNumberId: numberId, phone: owner, text: title, status: "completed",
  } });
  const reminder = await persistReminder({ phone: owner, title, remindAt: options.date ?? "2099-07-20T10:00:00-03:00" },
    prisma, { phoneNumberId: numberId, sourceMessageId: source.id });
  await prisma.scheduleOutbox.update({ where: { reminderId: reminder.id }, data: { nextAttemptAt: new Date(0) } });
  return prisma.reminder.update({ where: { id: reminder.id }, data: { state: options.state ?? "active", status: options.status ?? "scheduled" } });
}
const manage = data => prisma.$transaction(tx => manageReminders(phone, business, data, tx));
const accepted = async () => ({ messages: [{ id: "wamid.management" }] });

test("consulta mostra somente lembretes ativos da pessoa e número comercial", async () => {
  await clear();
  await make("Meu lembrete");
  await make("Cancelado privado", { state: "cancelled" });
  await make("Concluído privado", { state: "completed" });
  await make("Outra pessoa privado", { phone: otherPhone });
  await make("Outra conta privado", { business: otherBusiness });
  const reply = await manage(intent("list_reminders"));
  assert.match(reply, /Meu lembrete/);
  assert.doesNotMatch(reply, /privado/);
  assert.doesNotMatch(reply, /[0-9a-f]{8}-[0-9a-f]{4}/);
});
test("consulta usa início inclusivo e fim exclusivo com fuso", async () => {
  await clear();
  await make("Dentro do dia", { date: "2099-07-20T00:00:00-03:00" });
  await make("Dia seguinte", { date: "2099-07-21T00:00:00-03:00" });
  const reply = await manage(intent("list_reminders", { rangeStart: "2099-07-20T00:00:00-03:00", rangeEnd: "2099-07-21T00:00:00-03:00" }));
  assert.match(reply, /Dentro do dia/);
  assert.doesNotMatch(reply, /Dia seguinte/);
});
test("intervalo inválido pede informação e não altera lembretes", async () => {
  await clear();
  await make();
  const reply = await manage(intent("cancel_reminder", { search: "Internet", rangeStart: "2099-07-21T00:00:00Z", rangeEnd: "2099-07-20T00:00:00Z" }));
  assert.match(reply, /Qual dia ou período/);
  assert.equal(await prisma.reminder.count({ where: { user: { phone }, state: "active" } }), 1);
});
test("título ambíguo pede escolha sem cancelar candidato", async () => {
  await clear();
  await make("Pagar internet casa"); await make("Pagar internet loja");
  const reply = await manage(intent("cancel_reminder", { search: "internet" }));
  assert.match(reply, /Qual deles/);
  assert.equal(await prisma.reminder.count({ where: { user: { phone }, state: "active" } }), 2);
});
test("ID de outra pessoa ou conta não permite cancelamento", async () => {
  await clear();
  const foreign = await make("Privado", { phone: otherPhone });
  const other = await make("Outra conta", { business: otherBusiness });
  for (const reminder of [foreign, other]) {
    assert.match(await manage(intent("cancel_reminder", { reminderId: reminder.id })), /Não encontrei/);
    assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).state, "active");
  }
});
test("cancelamento bloqueia job já publicado", async () => {
  await clear();
  const reminder = await make();
  assert.match(await manage(intent("cancel_reminder", { reminderId: reminder.id })), /Cancelei/);
  assert.equal(await deliverReminder(reminder.id, business, prisma, async () => assert.fail()), "skipped");
  assert.equal((await prisma.scheduleOutbox.findUniqueOrThrow({ where: { reminderId: reminder.id } })).status, "cancelled");
});
test("cancelamento impede publicação futura da pendência", async () => {
  await clear();
  const reminder = await make();
  await manage(intent("cancel_reminder", { search: reminder.title }));
  assert.equal(await relaySchedules(prisma, { add: async () => assert.fail() }, { phoneNumberId: business }), 0);
});
test("publicador antigo não reativa lembrete cancelado", { timeout: 10000 }, async () => {
  await clear();
  const reminder = await make();
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const publishing = relaySchedules(prisma, { add: async () => { entered(); await gate; } }, { phoneNumberId: business });
  await started;
  await manage(intent("cancel_reminder", { reminderId: reminder.id }));
  release(); await publishing;
  assert.equal((await prisma.scheduleOutbox.findUniqueOrThrow({ where: { reminderId: reminder.id } })).status, "cancelled");
  assert.equal(await deliverReminder(reminder.id, business, prisma, async () => assert.fail()), "skipped");
});
test("aviso já em envio não recebe confirmação falsa de cancelamento", async () => {
  await clear();
  const reminder = await make("Internet", { status: "sending" });
  assert.match(await manage(intent("cancel_reminder", { reminderId: reminder.id })), /já entrou em envio/);
  assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).state, "active");
});
test("concluir antes do disparo impede envio do job", async () => {
  await clear();
  const reminder = await make();
  assert.match(await manage(intent("complete_reminder", { reminderId: reminder.id })), /Marquei como concluído/);
  assert.equal(await deliverReminder(reminder.id, business, prisma, async () => assert.fail()), "skipped");
});
test("concluir durante envio preserva o resultado real do provedor", { timeout: 10000 }, async () => {
  await clear();
  const reminder = await make();
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const sending = deliverReminder(reminder.id, business, prisma, async () => { entered(); await gate; return accepted(); });
  await started;
  const reply = await manage(intent("complete_reminder", { reminderId: reminder.id }));
  release(); await sending;
  assert.match(reply, /envio do aviso já tinha começado/);
  const result = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
  assert.equal(result.state, "completed");
  assert.equal(result.status, "provider_accepted");
  assert.equal(result.providerMessageId, "wamid.management");
});
test("cancelar e concluir concorrentes não recebem dois sucessos conflitantes", async () => {
  await clear();
  const reminder = await make();
  const replies = await Promise.all([manage(intent("cancel_reminder", { reminderId: reminder.id })), manage(intent("complete_reminder", { reminderId: reminder.id }))]);
  assert.equal(replies.filter(reply => /^(Cancelei|Marquei)/.test(reply)).length, 1);
});
test("cancelamento e resposta são confirmados na mesma transação", async () => {
  await clear();
  const reminder = await make();
  const source = await prisma.incomingMessage.create({ data: {
    providerMessageId: randomUUID(), phoneNumberId: business, phone, text: "cancela Internet", nextAttemptAt: new Date(0),
  } });
  const deps = { buildContext: async () => ({}), interpret: async () => intent("cancel_reminder", { reminderId: reminder.id }) };
  await Promise.all([processInboxBatch(prisma, deps, business), processInboxBatch(prisma, deps, business)]);
  assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).state, "cancelled");
  const reply = await prisma.replyOutbox.findUniqueOrThrow({ where: { messageId: source.id } });
  assert.match(reply.text, /Cancelei/);
  let calls = 0;
  await relayReplies(prisma, async () => { calls++; return accepted(); }, business);
  await relayReplies(prisma, async () => { calls++; return accepted(); }, business);
  assert.equal(calls, 1);
});
test("falha no commit desfaz cancelamento e resposta", async () => {
  await clear();
  const reminder = await make();
  const source = await prisma.incomingMessage.create({ data: {
    providerMessageId: randomUUID(), phoneNumberId: business, phone, text: "cancela", nextAttemptAt: new Date(0),
  } });
  const store = { incomingMessage: prisma.incomingMessage, $transaction: callback => prisma.$transaction(async tx => { await callback(tx); throw Error("rollback"); }) };
  await processInboxBatch(store, { buildContext: async () => ({}), interpret: async () => intent("cancel_reminder", { reminderId: reminder.id }) }, business);
  assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).state, "active");
  assert.equal(await prisma.replyOutbox.count({ where: { messageId: source.id } }), 0);
});
test("contexto recente é limitado e não inclui pessoa ou conta diferente", async () => {
  await clear();
  for (let i = 0; i < 14; i++) await make("Meu " + i);
  await make("Segredo de outra pessoa", { phone: otherPhone });
  await make("Segredo de outra conta", { business: otherBusiness });
  await prisma.incomingMessage.create({ data: {
    providerMessageId: randomUUID(), phoneNumberId: business, phone, status: "completed",
    text: "Assunto antigo", receivedAt: new Date(Date.now() - 90 * 60000),
  } });
  const context = await conversationContext(prisma, { phone, phoneNumberId: business, text: "e agora?", receivedAt: new Date(Date.now() + 1000) });
  assert.equal(context.reminders.length, 12);
  assert.ok(context.lastMessages.length <= 4);
  for (const secret of ["Segredo de outra", "Assunto antigo"]) assert.equal(JSON.stringify(context).includes(secret), false);
});
test("contexto não trata resposta pendente como fala já enviada", async () => {
  await clear();
  const row = await prisma.incomingMessage.create({ data: {
    providerMessageId: randomUUID(), phoneNumberId: business, phone, text: "amanhã", status: "reply_pending",
    reply: { create: { text: "Resposta ainda não enviada" } },
  } });
  const context = await conversationContext(prisma, { phone, phoneNumberId: business, text: "às dez", receivedAt: new Date(Date.now() + 1000) });
  assert.equal(context.lastMessages[0].user, row.text);
  assert.equal(context.lastMessages[0].assistant, null);
  assert.equal(JSON.stringify(context).includes("Resposta ainda não enviada"), false);
});

test("cancelamento entre leitura e início de envio bloqueia o remetente antigo", { timeout: 10000 }, async () => {
  await clear();
  const reminder = await make();
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const store = { reminder: {
    findUnique: async args => { const row = await prisma.reminder.findUnique(args); entered(); await gate; return row; },
    updateMany: args => prisma.reminder.updateMany(args),
  } };
  const sending = deliverReminder(reminder.id, business, store, async () => assert.fail());
  await started;
  assert.match(await manage(intent("cancel_reminder", { reminderId: reminder.id })), /Cancelei/);
  release();
  assert.equal(await sending, "skipped");
});

test("ação sem suporte não é convertida em conclusão", async () => {
  await clear();
  const reminder = await make();
  assert.match(await manage(intent("create_expense", { reminderId: reminder.id })), /Ainda não consigo/);
  assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).state, "active");
});
