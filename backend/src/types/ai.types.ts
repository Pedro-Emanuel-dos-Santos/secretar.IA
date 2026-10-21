export type AIAction =
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
  action: AIAction;
  title: string | null;
  description: string | null;
  datetime: string | null;
  amount: number | null;
  category: string | null;
  reply: string;
  appointmentId?: string | null;
  alertMinutes?: number[];
  subject?: string | null;
  subjectKind?: "client" | "project";
  factKey?: string | null;
  factValue?: string | null;
  includeHistory?: boolean;
  reminderId?: string | null;
  search?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  expectedVersion?: number;
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; count: number | null } | null;
  cancelSeries?: boolean;
  draft?: { date: string | null; time: string | null } | null;
};
