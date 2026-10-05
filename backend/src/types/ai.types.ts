export type AIAction =
  | "conversation"
  | "create_reminder"
  | "list_reminders"
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
};