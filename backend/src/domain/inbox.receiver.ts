export type IncomingText = {
  providerMessageId: string;
  phoneNumberId: string;
  phone: string;
  text: string;
};

export class InvalidWebhookError extends Error {}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

// Persist only supported message fields; do not retain the full private webhook payload.
export function extractMessages(payload: unknown, expectedPhoneNumberId: string): IncomingText[] {
  if (!object(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) throw new InvalidWebhookError("Payload inválido.");
  const messages: IncomingText[] = [];
  for (const entry of payload.entry) {
    if (!object(entry) || !Array.isArray(entry.changes)) throw new InvalidWebhookError("Entrada inválida.");
    for (const change of entry.changes) {
      if (!object(change)) throw new InvalidWebhookError("Alteração inválida.");
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!object(value)) throw new InvalidWebhookError("Evento inválido.");
      if (value.metadata?.phone_number_id !== expectedPhoneNumberId) continue;
      if (value.messages === undefined) continue; // Delivery statuses are not incoming text.
      if (!Array.isArray(value.messages)) throw new InvalidWebhookError("Mensagens inválidas.");
      for (const message of value.messages) {
        if (!object(message)) throw new InvalidWebhookError("Mensagem inválida.");
        if (message.type !== "text") continue;
        if (typeof message.id !== "string" || !message.id || message.id.length > 512 ||
            typeof message.from !== "string" || !/^\d{8,15}$/.test(message.from) ||
            !object(message.text) || typeof message.text.body !== "string" ||
            !message.text.body.trim() || message.text.body.length > 16000) throw new InvalidWebhookError("Texto inválido.");
        messages.push({ providerMessageId: message.id, phoneNumberId: expectedPhoneNumberId, phone: message.from, text: message.text.body });
      }
    }
  }
  return messages;
}

export type InboxWriter = {
  createMany(args: { data: IncomingText[]; skipDuplicates: true }): Promise<{ count: number }>;
};

export async function receiveMessages(payload: unknown, expectedPhoneNumberId: string, inbox: InboxWriter) {
  const messages = extractMessages(payload, expectedPhoneNumberId);
  if (!messages.length) return { count: 0 };
  // A single atomic insert. The DB unique constraint handles concurrent re-deliveries.
  return inbox.createMany({ data: messages, skipDuplicates: true });
}
