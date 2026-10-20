// Explicit aliases handle test-recipient allowlists without changing conversation identity.
export function resolveWhatsAppRecipient(phone: string, mapping?: string): string {
  if (!mapping?.trim()) return phone;
  let aliases: unknown;
  try { aliases = JSON.parse(mapping); } catch { throw new Error("WHATSAPP_RECIPIENT_MAP precisa ser um objeto JSON."); }
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) throw new Error("Mapa de destinatários inválido.");
  for (const [from, to] of Object.entries(aliases)) {
    if (!/^\d{8,15}$/.test(from) || typeof to !== "string" || !/^\d{8,15}$/.test(to)) throw new Error("Telefone inválido no mapa de destinatários.");
  }
  return Object.prototype.hasOwnProperty.call(aliases, phone) ? (aliases as Record<string, string>)[phone]! : phone;
}
