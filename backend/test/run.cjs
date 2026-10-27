// In-process TypeScript loading avoids tsx/esbuild subprocesses in restricted environments.
require("./register.cjs");
require("./audio-consent.test.cjs");
require("./inbox.fairness.test.cjs");
require("./review-conversation.test.cjs");
require("./fact-provenance.test.cjs");
require("./subject-pending.test.cjs");
require("./subject-proposal.test.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validateReminder } = require("../src/domain/reminder.validation.ts");
const { parseInterpretation } = require("../src/domain/interpretation.validation.ts");
const { executeAction } = require("../src/domain/action.executor.ts");
const { persistReminder } = require("../src/domain/reminder.creator.ts");
const { prepareConversation } = require("../src/domain/conversation.processor.ts");
const { tryRules } = require("../src/ai/rules.provider.ts");
const input = { phone: "5511999990000", title: "Pagar internet", remindAt: "2099-07-20T10:00:00-03:00" };
const interpretation = {
  action: "create_reminder", title: input.title, datetime: input.remindAt,
  description: null, amount: null, category: null, reply: "Fiz tudo!",
};

for (const date of ["invalida", "2099-02-30T10:00:00-03:00", "2099-07-20T25:00:00Z", "2099-07-20T10:00:00", "2020-07-20T10:00:00Z", "2099-07-20T10:00:00+14:30"]) {
  test("rejeita data: " + date, () => assert.throws(() => validateReminder({ ...input, remindAt: date })));
}
test("aceita data futura com offset e normaliza título", () => {
  const result = validateReminder({ ...input, title: "  Pagar internet  " });
  assert.equal(result.title, input.title);
  assert.equal(result.reminderDate.toISOString(), "2099-07-20T13:00:00.000Z");
});
test("rejeita telefone, título e descrição inválidos", () => {
  for (const fields of [{ phone: "abc" }, { title: " " }, { description: 42 }, { title: "a".repeat(501) }]) {
    assert.throws(() => validateReminder({ ...input, ...fields }));
  }
});
for (const value of ["texto", "null", "[]", JSON.stringify({ ...interpretation, action: "delete_all" }), JSON.stringify({ ...interpretation, datetime: {} }), JSON.stringify({ ...interpretation, amount: "10" }), JSON.stringify({ ...interpretation, reply: "" })]) {
  test("rejeita interpretação inválida: " + value.slice(0, 50), () => assert.throws(() => parseInterpretation(value)));
}
test("copia somente campos permitidos", () => {
  assert.deepEqual(parseInterpretation(JSON.stringify({ ...interpretation, admin: true })), interpretation);
});
test("saudações não quebram o modo JSON", () => {
  assert.equal(tryRules({ jsonMode: true, messages: [{ role: "user", content: "oi" }] }), null);
  assert.equal(tryRules({ messages: [{ role: "user", content: "oi" }] }).provider, "rules");
});
test("pergunta dado ausente sem criar lembrete", async () => {
  let calls = 0;
  const create = async () => { calls++; throw Error("não deve executar"); };
  assert.match(await executeAction(input.phone, { ...interpretation, datetime: null }, create), /dia e horário/);
  assert.match(await executeAction(input.phone, { ...interpretation, title: null }, create), /Do que/);
  assert.equal(calls, 0);
});
test("não executa data inválida nem usa confirmação inventada", async () => {
  const reply = await executeAction(input.phone, { ...interpretation, datetime: "2099-02-30T10:00:00Z" }, async () => assert.fail());
  assert.match(reply, /válidos no futuro/);
  assert.doesNotMatch(reply, /Fiz tudo/);
});
test("ações não implementadas não retornam sucesso", async () => {
  for (const action of ["list_reminders", "create_expense"]) {
    assert.match(await executeAction(input.phone, { ...interpretation, action }, async () => assert.fail()), /Ainda não consigo/);
  }
});
test("confirma só depois da persistência e usa resultado real", async () => {
  let release;
  let finished = false;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = executeAction(input.phone, interpretation, async () => {
    await gate;
    return { title: "Título persistido", remindAt: new Date(input.remindAt) };
  }).then(reply => { finished = true; return reply; });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  const reply = await pending;
  assert.match(reply, /Título persistido/);
  assert.match(reply, /10:00/);
  assert.doesNotMatch(reply, /Fiz tudo/);
});
test("falha de execução impede confirmação", async () => {
  await assert.rejects(executeAction(input.phone, interpretation, async () => { throw Error("banco indisponível"); }), /indisponível/);
});

function fixture({ dbFailure = false } = {}) {
  const calls = [];
  const store = {
    contactPreference:{findUnique:async()=>null},
    user: { upsert: async args => { calls.push(["user", args]); return { id: "user-1" }; } },
    reminder: {
      count: async () => 0,
      create: async args => { calls.push(["create", args]); if (dbFailure) throw Error("db"); return { id: "reminder-1", title: args.data.title, remindAt: args.data.remindAt, status: args.data.status }; },
      updateMany: async args => { calls.push(["update", args]); },
    },
  };
  const transactionalStore = { $transaction: callback => callback(store), reminder: store.reminder };
  return { calls, store: transactionalStore };
}
test("entrada inválida não toca banco nem fila", async () => {
  const f = fixture();
  await assert.rejects(persistReminder({ ...input, remindAt: "invalid" }, f.store, { phoneNumberId: "test" }));
  assert.deepEqual(f.calls, []);
});
test("falha de banco não agenda", async () => {
  const f = fixture({ dbFailure: true });
  await assert.rejects(persistReminder(input, f.store, { phoneNumberId: "test" }));
  assert.deepEqual(f.calls.map(c => c[0]), ["user", "create"]);
});
test("pendência de agendamento é criada junto com o lembrete", async () => {
  const f = fixture();
  await persistReminder(input, f.store, { phoneNumberId: "test" });
  assert.deepEqual(f.calls[1][1].data.scheduleOutbox, { create: { phoneNumberId: "test" } });
  assert.equal(f.calls[1][1].data.status, "scheduling_pending");
});
test("retorna o registro durável sem depender da conexão com a fila", async () => {
  const f = fixture();
  const result = await persistReminder(input, f.store, { phoneNumberId: "test" });
  assert.equal(result.id, "reminder-1");
  assert.deepEqual(f.calls.map(c => c[0]), ["user", "create"]);
  assert.equal(result.status, "scheduling_pending");
});
test("preparação produz interpretação validada sem executar ou enviar", async () => {
  const context = { message: "teste" };
  const result = await prepareConversation({ phone: input.phone, text: "Me lembra dia 20/07/2099 às 10h de pagar internet", receivedAt: new Date() }, {
    buildContext: async () => context, interpret: async received => { assert.equal(received, context); return interpretation; },
  });
  assert.deepEqual(result, interpretation);
});
test("falha antes da interpretação interrompe a preparação", async () => {
  await assert.rejects(prepareConversation({ phone: input.phone, text: "Me lembra de algo amanhã", receivedAt: new Date() }, {
    buildContext: async () => { throw Error("contexto"); }, interpret: async () => assert.fail(),
  }), /contexto/);
});
test("preparação rejeita saída sem contrato antes de qualquer ação", async () => {
  await assert.rejects(prepareConversation({ phone: input.phone, text: "Me lembra de algo amanhã", receivedAt: new Date() }, {
    buildContext: async () => ({}), interpret: async () => ({ ...interpretation, reply: null }),
  }));
});

require("./inbox.test.cjs");
require("./durability.test.cjs");
require("./replies.test.cjs");
require("./operations.test.cjs");
require("./management.test.cjs");

const { relativeReminderTime } = require("../src/domain/relative-time.ts");
test("duração relativa usa instante recebido sem deslocar três horas", async () => {
  const receivedAt = new Date("2026-10-19T18:36:16.822Z");
  const result = await prepareConversation({ phone: input.phone, phoneNumberId: "test", text: "Me lembra daqui a 3 minutos de beber água", receivedAt }, {
    buildContext: async () => ({}), interpret: async () => ({ ...interpretation, datetime: "2026-10-19T18:39:16.822-03:00" }),
  });
  assert.equal(result.datetime, "2026-10-19T18:39:16.822Z");
});
test("duração atravessa meia-noite e aceita horas e segundos", () => {
  const at = new Date("2026-10-20T02:59:30Z");
  assert.equal(relativeReminderTime("Me lembre em 2 minutos de dormir", at), "2026-10-20T03:01:30.000Z");
  assert.equal(relativeReminderTime("daqui a 1 hora", at), "2026-10-20T03:59:30.000Z");
  assert.equal(relativeReminderTime("em 30 segundos", at), "2026-10-20T03:00:00.000Z");
});

test("pedido com tarefa antes da duração não vira meia-noite", async () => {
  const receivedAt = new Date("2026-10-20T21:30:00Z");
  for (const text of ["quero beber água em um minuto", "queria beber água em um minuto", "Me lembra de beber água daqui a 1 minuto", "Me lembra de tomar água daqui a 1 min", "Isso um nome lembrete em exatamente 1 minuto", "Preciso ligar para o cliente em dois minutos."]) {
    const minutes = text.includes("dois") ? 2 : 1;
    const result = await prepareConversation({ phone: input.phone, phoneNumberId: "test", text, receivedAt }, {
      buildContext: async () => ({}), interpret: async () => ({ ...interpretation, datetime: "2026-10-21T00:00:00-03:00" }),
    });
    assert.equal(result.datetime, new Date(receivedAt.getTime() + minutes * 60000).toISOString(), text);
  }
  for (const text of ["quero beber água em 1 hora e 30 minutos", "não quero beber água em um minuto", "ele disse que queria beber água em um minuto", "quero beber água amanhã em um minuto"]) {
    assert.equal(relativeReminderTime(text, receivedAt), null, text);
  }
});
test("não adivinha durações compostas, negativas ou referências históricas", () => {
  for (const text of ["em 1 hora e 30 minutos", "não me lembra daqui a 3 minutos", "ele disse daqui a 3 minutos", "amanhã às 3", "em 0 minutos", "em -3 minutos"]) {
    assert.equal(relativeReminderTime(text, new Date()), null, text);
  }
});

const { extractDeliveryReceipts, receiveDeliveryReceipts } = require("../src/domain/delivery.receipts.ts");
const receiptPayload = (row, business = "biz") => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: business }, statuses: [row] } }] }] });
const receiptRow = { id: "wamid.test", status: "failed", timestamp: "1792435200", recipient_id: "5511999990000", errors: [{ code: 131030, message: "private detail" }] };
test("extrai status e códigos sem guardar payload privado", () => {
  const result = extractDeliveryReceipts(receiptPayload(receiptRow), "biz");
  assert.deepEqual(result, [{ providerMessageId: "wamid.test", status: "failed", timestamp: "1792435200", phone: "5511999990000", errorCodes: [131030] }]);
  assert.deepEqual(extractDeliveryReceipts(receiptPayload(receiptRow, "other"), "biz"), []);
  assert.deepEqual(extractDeliveryReceipts(receiptPayload({ ...receiptRow, status: "invalid" }), "biz"), []);
});
test("recibos repetidos usam a mesma identidade e não guardam telefone no evento", async () => {
  const writes = [];
  const tx = { user: { upsert: async () => ({ id: "user" }) }, event: { upsert: async args => writes.push(args) },
    reminder: { updateMany: async () => ({ count: 0 }) }, replyOutbox: { updateMany: async () => ({ count: 0 }) } };
  const store = { incomingMessage: { findFirst: async () => ({ id: "known" }) }, $transaction: fn => fn(tx) };
  await receiveDeliveryReceipts(receiptPayload(receiptRow), "biz", store);
  await receiveDeliveryReceipts(receiptPayload(receiptRow), "biz", store);
  assert.equal(writes[0].where.id, writes[1].where.id);
  assert.equal(writes[0].create.payload.phone, undefined);
  assert.equal(writes[0].create.payload.phoneNumberId, "biz");
});
test("recibo de destinatário desconhecido não cria usuário ou evento", async () => {
  await receiveDeliveryReceipts(receiptPayload(receiptRow), "biz", { incomingMessage: { findFirst: async () => null }, $transaction: () => assert.fail() });
});

require("./recipient.test.cjs");
require("./whatsapp.policy.test.cjs");
require("./redis.test.cjs");
require("./buttons.test.cjs");
require("./recurrence.test.cjs");
require("./audio.test.cjs");
require("./commands.test.cjs");
require("./ai-provider.test.cjs");
require("./preflight.test.cjs");
require("./reminder.http.test.cjs");
require("./conversation.test.cjs");
require("./conversation-social.test.cjs");
require("./conversation-references.test.cjs");
require("./task-selection.test.cjs");
require("./reschedule-parts.test.cjs");
require("./conversation-target.test.cjs");
require("./personal-memory.test.cjs");
require("./calendar-export.test.cjs");
require("./agenda.test.cjs");
require("./client-period.test.cjs");
require("./reply-language.test.cjs");
require("./ai-usage.test.cjs");
require("./timezone.test.cjs");
require("./appointment-guards.test.cjs");
require("./appointment-duration.test.cjs");
require("./appointment-slots.test.cjs");
require("./worker-startup.test.cjs");
