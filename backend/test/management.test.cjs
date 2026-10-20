const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseInterpretation } = require("../src/domain/interpretation.validation.ts");
const { parseTimestamp } = require("../src/domain/reminder.validation.ts");
const { formatReminderReply } = require("../src/domain/action.executor.ts");
const intent = { action: "cancel_reminder", title: null, description: null, datetime: null,
  amount: null, category: null, reply: "ok", search: "internet", reminderId: null };
test("contrato aceita operações e referências estruturadas", () => {
  assert.deepEqual(parseInterpretation(JSON.stringify(intent)), intent);
  assert.equal(parseInterpretation(JSON.stringify({ ...intent, action: "complete_reminder" })).action, "complete_reminder");
});
test("referências malformadas são rejeitadas antes de consultar dados", () => {
  for (const fields of [{ search: [] }, { reminderId: 3 }, { rangeStart: {} }, { search: "a".repeat(501) }]) {
    assert.throws(() => parseInterpretation(JSON.stringify({ ...intent, ...fields })));
  }
});
test("intervalo pode consultar passado, sem aceitar calendário inválido", () => {
  assert.equal(parseTimestamp("2020-01-01T00:00:00-03:00").toISOString(), "2020-01-01T03:00:00.000Z");
  assert.throws(() => parseTimestamp("2026-02-30T00:00:00Z"));
});
test("resposta atrasada de criação não promete aviso cancelado ou concluído", () => {
  for (const state of ["cancelled", "completed"]) {
    const reply = formatReminderReply({ title: "Internet", remindAt: new Date("2099-07-20T13:00:00Z"), status: "scheduled", state });
    assert.doesNotMatch(reply, /eu te lembro/);
  }
});
