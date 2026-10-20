const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepareConversation } = require("../src/domain/conversation.processor.ts");

test("preparação sem resposta tem prazo e não inicia efeitos externos", async () => {
  await assert.rejects(prepareConversation({ phone: "5511999990000", text: "oi", receivedAt: new Date() }, {
    buildContext: async () => ({}), interpret: () => new Promise(() => {}),
  }, 5), /no prazo/);
});
