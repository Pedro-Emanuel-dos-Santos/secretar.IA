export type ReminderInput = { phone: string; title: string; description?: string; remindAt: string };

// A timezone is mandatory: server settings must never decide the user's appointment.
const timestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseTimestamp(value: unknown) {
  const match = typeof value === "string" && timestamp.exec(value);
  if (!match) throw new Error("Informe uma data ISO com fuso horário explícito.");
  const [, year, month, day, hour, minute, second = "0", offset] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  if (Number(year) < 2000 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) throw new Error("A data do lembrete é inválida.");
  const reminderDate = new Date(value as string);
  if (!Number.isFinite(reminderDate.getTime())) throw new Error("A data é inválida.");
  return reminderDate;
}

export function validateReminder(input: ReminderInput, now = Date.now()) {
  if (typeof input?.phone !== "string" || !/^\d{8,15}$/.test(input.phone)) throw new Error("Informe um telefone com código do país, somente números.");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 500) throw new Error("Informe um título entre 1 e 500 caracteres.");
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 5000)) throw new Error("A descrição deve ter até 5000 caracteres.");
  const reminderDate = parseTimestamp(input.remindAt);
  if (reminderDate.getTime() <= now) throw new Error("A data do lembrete precisa ser no futuro.");
  return { ...input, title: input.title.trim(), reminderDate };
}
