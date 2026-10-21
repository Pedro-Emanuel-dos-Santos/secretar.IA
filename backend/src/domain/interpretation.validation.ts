import { AIInterpretation } from "../types/ai.types";

const actions = new Set(["create_appointment", "list_appointments", "reschedule_appointment", "cancel_appointment", "set_appointment_alerts", "save_fact", "search_facts","conversation", "create_reminder", "list_reminders", "cancel_reminder", "complete_reminder", "reschedule_reminder", "save_note", "search_notes", "discard_draft", "create_expense", "unknown"]);

actions.add("appointment_history");
actions.add("mark_waiting");
actions.add("forget_fact");
actions.add("edit_reminder");

export function parseInterpretation(content: string): AIInterpretation {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Interpretação inválida.");
  // Providers may omit irrelevant nullable fields. Absence is not a guessed
  // value: executors still require the arguments needed by each action.
  const record:Record<string,unknown> = {title:null,description:null,datetime:null,category:null,amount:null,...value as Record<string,unknown>};
  if (typeof record.action !== "string" || !actions.has(record.action)) throw new Error("Ação inválida.");
  if (typeof record.reply !== "string" || !record.reply.trim() || record.reply.length > 2000) throw new Error("Resposta inválida.");
  for (const key of ["title", "description", "datetime", "category"] as const) {
    if (record[key] !== null && typeof record[key] !== "string") throw new Error("Campo inválido.");
  }
  if (record.amount !== null && (typeof record.amount !== "number" || !Number.isFinite(record.amount))) throw new Error("Valor inválido.");
  const extra: Partial<AIInterpretation> = {};
  if(record.taskFilter!==undefined && record.taskFilter!==null){
    if(!["pending","waiting","completed","cancelled","overdue"].includes(record.taskFilter as string))throw Error("Filtro de tarefas inválido.");
    extra.taskFilter=record.taskFilter as AIInterpretation["taskFilter"];
  }
  if(record.waitingFor!==undefined && record.waitingFor!==null){
    if(typeof record.waitingFor!=="string" || !record.waitingFor.trim() || record.waitingFor.length>120)throw Error("Responsável inválido.");
    extra.waitingFor=record.waitingFor.trim();
  }
  if(record.alertMinutes!==undefined){
    if(!Array.isArray(record.alertMinutes)||record.alertMinutes.length<1||record.alertMinutes.length>3||record.alertMinutes.some(n=>!Number.isSafeInteger(n)||n<0||n>10080)||new Set(record.alertMinutes).size!==record.alertMinutes.length)throw Error("Avisos inválidos.");
    extra.alertMinutes=record.alertMinutes;
  }
  if(record.subjectKind!==undefined && record.subjectKind!==null){if(!["client","project"].includes(record.subjectKind as string))throw Error("Tipo inválido.");extra.subjectKind=record.subjectKind as "client"|"project";}
  if(record.includeHistory!==undefined){if(typeof record.includeHistory!=="boolean")throw Error("Histórico inválido.");extra.includeHistory=record.includeHistory;}
  if (record.draft !== undefined) {
    if(record.draft === null) extra.draft=null;
    else {
      const draft=record.draft as Record<string,unknown>;
      if(typeof draft!=="object" || Array.isArray(draft) || !["create_reminder","reschedule_reminder","create_appointment","reschedule_appointment"].includes(record.action as string)) throw new Error("Rascunho inválido.");
      if(draft.date!==null && (typeof draft.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)))throw new Error("Dia inválido.");
      if(draft.time!==null && (typeof draft.time!=="string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)))throw new Error("Hora inválida.");
      extra.draft={date:draft.date as string|null,time:draft.time as string|null};
    }
  }
  if (record.recurrence !== undefined && record.recurrence !== null) {
    const r = record.recurrence as Record<string,unknown>;
    if (typeof r !== "object" || Array.isArray(r) || !["daily", "weekly", "monthly"].includes(r.frequency as string) ||
        (r.count !== null && (!Number.isSafeInteger(r.count) || (r.count as number) < 2 || (r.count as number) > 12))) throw new Error("Recorrência inválida.");
    extra.recurrence = { frequency: r.frequency as "daily" | "weekly" | "monthly", count: r.count as number | null };
  }
  if (record.cancelSeries !== undefined) {
    if (typeof record.cancelSeries !== "boolean") throw new Error("Escopo inválido.");
    extra.cancelSeries = record.cancelSeries;
  }
  if ("expectedVersion" in record) {
    if (!Number.isSafeInteger(record.expectedVersion) || (record.expectedVersion as number) < 0) throw new Error("Versão inválida.");
    extra.expectedVersion = record.expectedVersion as number;
  }
  for (const key of ["reminderId", "search", "rangeStart", "rangeEnd", "appointmentId", "subject", "factKey", "factValue", "newTitle"] as const) {
    if (!(key in record)) continue;
    if (record[key] !== null && (typeof record[key] !== "string" || record[key].length > 500)) throw new Error("Referência inválida.");
    extra[key] = record[key] as string | null;
  }
  return {
    ...extra,
    action: record.action as AIInterpretation["action"], title: record.title as string | null,
    description: record.description as string | null, datetime: record.datetime as string | null,
    amount: record.amount as number | null, category: record.category as string | null, reply: record.reply.trim(),
  };
}
