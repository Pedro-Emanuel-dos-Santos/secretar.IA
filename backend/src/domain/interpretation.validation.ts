import { AIInterpretation } from "../types/ai.types";

const actions = new Set(["create_appointment", "list_appointments", "reschedule_appointment", "cancel_appointment", "set_appointment_alerts", "save_fact", "search_facts","conversation", "create_reminder", "list_reminders", "cancel_reminder", "complete_reminder", "reschedule_reminder", "save_note", "search_notes", "discard_draft", "create_expense", "unknown"]);

actions.add("appointment_history");
for(const action of ["propose_subject_update","confirm_subject_update","discard_subject_update"])actions.add(action);
for(const action of ["create_subject_pending","list_subject_pendings","update_subject_pending"])actions.add(action);
actions.add("subject_overview");
actions.add("mark_waiting");
actions.add("forget_fact");
actions.add("edit_reminder");
actions.add("set_task_subject");
actions.add("select_task");
actions.add("agenda_overview");
for(const action of ["edit_note","delete_note","set_preferences","show_preferences","usage_summary"])actions.add(action);
for(const action of ["remember_personal","recall_personal","update_personal","forget_personal"])actions.add(action);

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
  if(record.subjectPendingId!==undefined){if(typeof record.subjectPendingId!=="string" || !record.subjectPendingId || record.subjectPendingId.length>100)throw Error("Referência de pendência inválida.");extra.subjectPendingId=record.subjectPendingId;}
  if(record.nextAction!==undefined && record.nextAction!==null){if(typeof record.nextAction!=="string" || !record.nextAction.trim() || record.nextAction.length>300)throw Error("Próxima ação inválida.");extra.nextAction=record.nextAction.trim();}
  if(record.pendingState!==undefined && record.pendingState!==null){if(!["pending","waiting","completed","cancelled"].includes(record.pendingState as string))throw Error("Estado de pendência inválido.");extra.pendingState=record.pendingState as AIInterpretation["pendingState"];}
  if(record.appointmentSuggestionId!==undefined){if(typeof record.appointmentSuggestionId!=="string" || record.appointmentSuggestionId.length>100 || !Number.isSafeInteger(record.appointmentSuggestionIndex) || (record.appointmentSuggestionIndex as number)<0 || (record.appointmentSuggestionIndex as number)>2)throw Error("Opção de compromisso inválida.");extra.appointmentSuggestionId=record.appointmentSuggestionId;extra.appointmentSuggestionIndex=record.appointmentSuggestionIndex as number;}
  if(record.durationMinutes!==undefined && record.durationMinutes!==null){if(!Number.isSafeInteger(record.durationMinutes) || (record.durationMinutes as number)<1 || (record.durationMinutes as number)>1440 || !["create_appointment","reschedule_appointment"].includes(record.action as string))throw Error("Duração inválida.");extra.durationMinutes=record.durationMinutes as number;}
  if(record.memoryKind!==undefined && record.memoryKind!==null){if(!["routine","preference","person","goal"].includes(record.memoryKind as string))throw Error("Tipo de memória inválido.");extra.memoryKind=record.memoryKind as AIInterpretation["memoryKind"];}
  if(record.agendaPeriod!==undefined && record.agendaPeriod!==null){if(!["today","tomorrow","day_after_tomorrow","week","next_week","next_7_days"].includes(record.agendaPeriod as string))throw Error("Período da agenda inválido.");extra.agendaPeriod=record.agendaPeriod as AIInterpretation["agendaPeriod"];}
  if(record.selectionFocusId!==undefined){if(typeof record.selectionFocusId!=="string" || record.selectionFocusId.length>100)throw Error("Referência inválida.");extra.selectionFocusId=record.selectionFocusId;}
  if(record.clearSubject!==undefined && record.clearSubject!==null){if(typeof record.clearSubject!=="boolean")throw Error("Vínculo inválido.");extra.clearSubject=record.clearSubject;}
  if(record.expectedSubjectId!==undefined){if(record.expectedSubjectId!==null && (typeof record.expectedSubjectId!=="string" || record.expectedSubjectId.length>100))throw Error("Vínculo esperado inválido.");extra.expectedSubjectId=record.expectedSubjectId as string|null;}
  for(const key of ["timezone","displayName","businessType"] as const){
    if(record[key]===undefined || record[key]===null)continue;
    if(typeof record[key]!=="string" || !record[key].trim() || record[key].length>100)throw Error("Preferência inválida.");
    extra[key]=record[key].trim();
  }
  if(record.audioConsent!==undefined && record.audioConsent!==null){if(typeof record.audioConsent!=="boolean")throw Error("Consentimento inválido.");extra.audioConsent=record.audioConsent;}
  if(record.summaryEnabled!==undefined && record.summaryEnabled!==null){if(typeof record.summaryEnabled!=="boolean")throw Error("Preferência de resumo inválida.");extra.summaryEnabled=record.summaryEnabled;}
  if(record.summaryTime!==undefined && record.summaryTime!==null){if(typeof record.summaryTime!=="string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.summaryTime))throw Error("Hora do resumo inválida.");extra.summaryTime=record.summaryTime;}
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
  if(record.selectionListId!==undefined){
    if(typeof record.selectionListId!=="string" || record.selectionListId.length>100 || !Number.isSafeInteger(record.selectionIndex) || (record.selectionIndex as number)<0 || (record.selectionIndex as number)>9)throw Error("Seleção inválida.");
    extra.selectionListId=record.selectionListId;extra.selectionIndex=record.selectionIndex as number;
  }
  for (const key of ["reminderId", "memoryId", "noteId", "search", "rangeStart", "rangeEnd", "appointmentId", "subject", "factKey", "factValue", "newTitle"] as const) {
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
