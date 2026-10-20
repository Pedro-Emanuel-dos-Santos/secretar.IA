export type AIAction =
  | "conversation"
  | "create_reminder"
  | "list_reminders"
  | "cancel_reminder"
  | "complete_reminder"
  | "reschedule_reminder"
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
  reminderId?: string | null;
  search?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  expectedVersion?: number;
};
