export class WhatsAppPreflightError extends Error {
  constructor(public readonly reason: "template_required" | "reply_window_closed") {
    super(reason === "template_required" ? "Envio aguarda um modelo de lembrete aprovado." : "A janela de resposta do WhatsApp está fechada.");
    this.name = "WhatsAppPreflightError";
  }
}

export type TemplateConfiguration = { name?: string; language?: string; approved?: boolean };

export function whatsappPayload(phone: string, message: string, lastInbound: Date | null,
  kind: "reply" | "reminder", template: TemplateConfiguration = {}, now = Date.now()) {
  // Keep a small margin: a request near expiry must not become a free-form send after expiry.
  const age = lastInbound ? now - lastInbound.getTime() : Infinity;
  if (Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60_000 - 60_000) {
    return { messaging_product: "whatsapp", to: phone, type: "text", text: { body: message } };
  }
  if (kind === "reply") throw new WhatsAppPreflightError("reply_window_closed");
  if (!template.approved || !template.name || !/^[a-z0-9_]+$/.test(template.name) || !template.language) {
    throw new WhatsAppPreflightError("template_required");
  }
  return {
    messaging_product: "whatsapp", to: phone, type: "template",
    template: { name: template.name, language: { code: template.language },
      components: [{ type: "body", parameters: [{ type: "text", text: message.replace(/\s+/g, " ").trim() }] }] },
  };
}
