import { AIInterpretation } from "../types/ai.types";

const actions = new Set(["conversation", "create_reminder", "list_reminders", "cancel_reminder", "complete_reminder", "create_expense", "unknown"]);

export function parseInterpretation(content: string): AIInterpretation {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Interpretação inválida.");
  const record = value as Record<string, unknown>;
  if (typeof record.action !== "string" || !actions.has(record.action)) throw new Error("Ação inválida.");
  if (typeof record.reply !== "string" || !record.reply.trim() || record.reply.length > 2000) throw new Error("Resposta inválida.");
  for (const key of ["title", "description", "datetime", "category"] as const) {
    if (record[key] !== null && typeof record[key] !== "string") throw new Error("Campo inválido.");
  }
  if (record.amount !== null && (typeof record.amount !== "number" || !Number.isFinite(record.amount))) throw new Error("Valor inválido.");
  const extra: Partial<AIInterpretation> = {};
  for (const key of ["reminderId", "search", "rangeStart", "rangeEnd"] as const) {
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
