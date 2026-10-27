export type AIAction =
  | "propose_subject_update" | "confirm_subject_update" | "discard_subject_update"
  | "create_subject_pending" | "list_subject_pendings" | "update_subject_pending"
  | "remember_personal" | "recall_personal" | "update_personal" | "forget_personal"
  | "agenda_overview"
  | "select_task"
  | "set_task_subject"
  | "subject_overview"
  | "edit_note" | "delete_note" | "set_preferences" | "show_preferences" | "usage_summary"
  | "mark_waiting"
  | "forget_fact"
  | "edit_reminder"
  | "appointment_history"
  | "create_appointment" | "list_appointments" | "reschedule_appointment" | "cancel_appointment" | "set_appointment_alerts"
  | "save_fact" | "search_facts"
  | "conversation"
  | "create_reminder"
  | "list_reminders"
  | "cancel_reminder"
  | "complete_reminder"
  | "reschedule_reminder"
  | "save_note"
  | "search_notes"
  | "discard_draft"
  | "create_expense"
  | "unknown";

export type AIInterpretation = {
  nextAction?:string|null;
  pendingState?:"pending"|"waiting"|"completed"|"cancelled";
  appointmentSuggestionId?:string;
  appointmentSuggestionIndex?:number;
  memoryId?:string|null;
  memoryKind?:"routine"|"preference"|"person"|"goal";
  action: AIAction;
  title: string | null;
  description: string | null;
  datetime: string | null;
  amount: number | null;
  category: string | null;
  reply: string;
  appointmentId?: string | null;
  alertMinutes?: number[];
  durationMinutes?:number;
  subject?: string | null;
  subjectKind?: "client" | "project";
  factKey?: string | null;
  factValue?: string | null;
  includeHistory?: boolean;
  reminderId?: string | null;
  noteId?: string | null;
  timezone?: string | null;
  displayName?: string | null;
  businessType?: string | null;
  audioConsent?: boolean;
  summaryEnabled?: boolean;
  summaryTime?: string | null;
  waitingFor?: string | null;
  newTitle?: string | null;
  taskFilter?: "pending" | "waiting" | "completed" | "cancelled" | "overdue";
  search?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  expectedVersion?: number;
  expectedSubjectId?:string|null;
  clearSubject?:boolean;
  agendaPeriod?:"today"|"tomorrow"|"day_after_tomorrow"|"week"|"next_week"|"next_7_days";
  selectionListId?:string;
  selectionIndex?:number;
  selectionFocusId?:string;
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; count: number | null } | null;
  cancelSeries?: boolean;
  draft?: { date: string | null; time: string | null } | null;
};
