import { parseTimestamp } from "./reminder.validation";

export type Recurrence = { frequency: "daily" | "weekly" | "monthly"; count: number };
function local(date: Date,zone="America/Sao_Paulo") {
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  return [Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)];
}
const wall = (v: number[]) => Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], v[5]);
function instant(parts: number[],zone:string) {
  const expected = wall(parts);
  let value = expected;
  for (let i = 0; i < 4; i++) value += expected - wall(local(new Date(value),zone));
  if (wall(local(new Date(value),zone)) !== expected) throw new Error("Horário local inexistente.");
  if ([-7200000,-3600000,-1800000,1800000,3600000,7200000].some(delta => wall(local(new Date(value + delta),zone)) === expected)) throw new Error("Horário local ambíguo.");
  return new Date(value);
}

export function recurrenceDates(first: string, recurrence?: Recurrence,zone="America/Sao_Paulo"): Date[] {
  const start = parseTimestamp(first);
  if (!recurrence) return [start];
  if (!["daily", "weekly", "monthly"].includes(recurrence.frequency) || !Number.isSafeInteger(recurrence.count) || recurrence.count < 2 || recurrence.count > 12) {
    throw new Error("Informe de 2 a 12 ocorrências, diárias, semanais ou mensais.");
  }
  const origin = local(start,zone), dates = [start];
  // A monthly series preserves the requested day; a nonexistent day is skipped,
  // never silently changed from the 31st to the 28th (or to the next month).
  for (let step = 1; dates.length < recurrence.count; step++) {
    const calendar = new Date(wall(origin));
    if (recurrence.frequency === "monthly") {
      calendar.setUTCDate(1); calendar.setUTCMonth(calendar.getUTCMonth() + step);
      const lastDay = new Date(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 0)).getUTCDate();
      if (origin[2] > lastDay) continue;
      calendar.setUTCDate(origin[2]);
    } else calendar.setUTCDate(calendar.getUTCDate() + step * (recurrence.frequency === "weekly" ? 7 : 1));
    dates.push(instant([calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), ...origin.slice(3)],zone));
  }
  return dates;
}

export function recurrenceSummary(reminder: { recurrenceFrequency?: string | null; recurrenceCount?: number | null; scheduleTimezone?:string }) {
  if (!reminder.recurrenceFrequency || !reminder.recurrenceCount) return "";
  const label: Record<string,string> = { daily: "diária", weekly: "semanal", monthly: "mensal" };
  return ` Série ${label[reminder.recurrenceFrequency]} com ${reminder.recurrenceCount} avisos no fuso ${reminder.scheduleTimezone || "America/Sao_Paulo"}.` +
    (reminder.recurrenceFrequency === "monthly" ? " Meses sem esse dia serão pulados." : "") +
    " Concluir ou adiar afeta só um aviso. Para interromper os próximos, peça para cancelar a série.";
}
