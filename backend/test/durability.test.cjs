const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executeAction } = require("../src/domain/action.executor.ts");
const { deliverReminder } = require("../src/domain/reminder.delivery.ts");
const { schedulingBackoff } = require("../src/domain/schedule.relay.ts");

test("agendamento pendente não recebe confirmação de sucesso", async () => {
  const reply = await executeAction("5511999990000", {
    action: "create_reminder", title: "Internet", datetime: "2099-07-20T10:00:00-03:00", description: null,
  }, async () => ({ title: "Internet", remindAt: new Date("2099-07-20T13:00:00Z"), status: "scheduling_pending" }));
  assert.match(reply, /ainda não foi confirmado/);
  assert.doesNotMatch(reply, /Combinado/);
});
test("espera progressiva cresce e tem limite", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(schedulingBackoff), [30000, 60000, 120000, 240000, 480000]);
  assert.equal(schedulingBackoff(20), 900000);
});
function deliveryStore(status = "scheduled") {
  const row = { id: "reminder", title: "Internet", status, state: "active", remindAt: new Date("2099-07-20T13:00:00Z"),
    user: { phone: "5511999990000" }, scheduleOutbox: { phoneNumberId: "number" } };
  return {
    row,
    reminder: {
      findUnique: async () => row,
      updateMany: async ({ where, data }) => {
        if (where.state && row.state !== where.state) return { count: 0 };
        const matches = typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status);
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
}
test("jobs concorrentes não enviam o mesmo lembrete duas vezes", async () => {
  const store = deliveryStore();
  let sends = 0;
  const send = async () => { sends++; await new Promise(resolve => setTimeout(resolve, 5)); return { messages: [{ id: "wamid.test" }] }; };
  await Promise.all([deliverReminder("reminder", "number", store, send), deliverReminder("reminder", "number", store, send)]);
  assert.equal(sends, 1);
  assert.equal(store.row.status, "provider_accepted");
});
test("aceitação com conexão perdida fica incerta sem novo envio", async () => {
  const store = deliveryStore();
  let sends = 0;
  await assert.rejects(deliverReminder("reminder", "number", store, async () => { sends++; throw Error("conexão perdida"); }));
  assert.equal(store.row.status, "delivery_unknown");
  assert.equal(await deliverReminder("reminder", "number", store, async () => { sends++; }), "skipped");
  assert.equal(sends, 1);
});
test("resposta sem identidade do provedor não vira aceitação confirmada", async () => {
  const store = deliveryStore();
  await assert.rejects(deliverReminder("reminder", "number", store, async () => ({})));
  assert.equal(store.row.status, "delivery_unknown");
});
test("envio assumido antes de uma queda não é repetido", async () => {
  const store = deliveryStore("sending");
  assert.equal(await deliverReminder("reminder", "number", store, async () => assert.fail()), "skipped");
});
test("job de outro número comercial não inicia envio", async () => {
  const store = deliveryStore();
  await assert.rejects(deliverReminder("reminder", "other-number", store, async () => assert.fail()), /incompatível/);
  assert.equal(store.row.status, "scheduled");
});
