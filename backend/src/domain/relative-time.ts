// Simple elapsed durations are measured from receipt, independently of time zones.
export function relativeReminderTime(text: string, receivedAt: Date): string | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const match = normalized.match(/^(?:(?:me (?:lembra|lembre)|(?:crie|criar|agende|agendar) (?:um )?lembrete)\s+)?(?:daqui a|em)\s+(\d+)\s+(segundos?|minutos?|horas?)(?=\s+(?:de|para)\b|[.!?]?\s*$)/);
  if (!match) return null;
  const amount = Number(match[1]);
  const factor = match[2].startsWith("segundo") ? 1000 : match[2].startsWith("minuto") ? 60000 : 3600000;
  const timestamp = receivedAt.getTime() + amount * factor;
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(timestamp) || Math.abs(timestamp) > 8640000000000000) return null;
  return new Date(timestamp).toISOString();
}
