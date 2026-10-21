// Simple elapsed durations are measured from receipt, independently of time zones.
const spokenAmounts: Record<string,number> = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20,trinta:30,sessenta:60};
function normalizeDuration(text:string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/\bmins?\b/g,"minuto").replace(/\bsegs?\b/g,"segundo")
    .replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|sessenta)(?=\s+(?:segundos?|minutos?|horas?)\b)/g, word=>String(spokenAmounts[word]));
}
export function relativeReminderTime(text: string, receivedAt: Date): string | null {
  const normalized = normalizeDuration(text);
  // Task-first requests are common in chat: "quero beber água em um minuto".
  // Only resolve one plain duration; mixed dates/durations need clarification.
  if (/\b(?:nao|amanha|ontem|hoje|depois de amanha)\b|\bas\s+\d|\b\d{1,2}:\d{2}\b/.test(normalized)) return null;
  if (/^(?:ele|ela)\s+disse\b/.test(normalized)) return null;
  if ((normalized.match(/\b(?:segundos?|minutos?|horas?)\b/g)?.length || 0) !== 1) return null;
  const match = normalized.match(/^(?:(?:me (?:lembra|lembre)|(?:crie|criar|agende|agendar) (?:um )?lembrete)\s+)?(?:daqui a|em)\s+(\d+)\s+(segundos?|minutos?|horas?)(?=\s+(?:de|para)\b|[.!?]?\s*$)/)
    || normalized.match(/\b(?:daqui a|em)\s+(?:exatamente\s+)?(\d+)\s+(segundos?|minutos?|horas?)[.!?]?\s*$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const factor = match[2].startsWith("segundo") ? 1000 : match[2].startsWith("minuto") ? 60000 : 3600000;
  const timestamp = receivedAt.getTime() + amount * factor;
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(timestamp) || Math.abs(timestamp) > 8640000000000000) return null;
  return new Date(timestamp).toISOString();
}

export function relativeRescheduleTime(text: string, receivedAt: Date): string | null {
  const normalized = normalizeDuration(text);
  const match = normalized.match(/^(?:adia|adie|adiar|reagenda|reagende|muda|mude)\b.{0,160}?\b(?:por|em|para daqui a)\s+(\d+)\s+(segundos?|minutos?|horas?)[.!?]?\s*$/);
  return match ? relativeReminderTime(`em ${match[1]} ${match[2]}`, receivedAt) : null;
}
