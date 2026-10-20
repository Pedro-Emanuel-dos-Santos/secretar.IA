export type ReminderLimits = { active:number; perDay:number };
export class ReminderQuotaError extends Error {
  constructor(public readonly reply:string) {super(reply);this.name="ReminderQuotaError";}
}
export class RemindersPausedError extends Error {
  readonly reply="Seus avisos estão pausados. Envie RETOMAR antes de criar novos lembretes.";
  constructor(){super("Avisos pausados pela pessoa.");this.name="RemindersPausedError";}
}
function limit(value:string | undefined, fallback:number, maximum:number) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error("Limite de lembretes inválido.");
  return number;
}
export function reminderLimits():ReminderLimits {
  return {active:limit(process.env.REMINDER_MAX_ACTIVE_PER_USER,100,5000),perDay:limit(process.env.REMINDER_MAX_CREATED_PER_DAY,50,1000)};
}
