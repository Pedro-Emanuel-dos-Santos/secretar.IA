import type { AIInterpretation } from "../types/ai.types";

export type ReminderControls = { id: string; version: number };
const pattern = /^sr1:(done|snooze10|snooze60):([0-9a-f-]{36}):(\d{1,9})$/;

export function reminderButtons(controls: ReminderControls) {
  return [
    { action: "done", title: "Concluir" },
    { action: "snooze10", title: "Adiar 10 min" },
    { action: "snooze60", title: "Adiar 1 hora" },
  ].map(({ action, title }) => ({ type: "reply", reply: {
    id: `sr1:${action}:${controls.id}:${controls.version}`, title,
  } }));
}

// IDs are references, never authority: execution must still check owner, business,
// version and state in the database transaction. Do not send button commands to AI.
export function buttonInterpretation(text: string, receivedAt: Date): AIInterpretation | null {
  if (!text.startsWith("sr1:")) return null;
  const match = pattern.exec(text);
  const base = { title: null, description: null, datetime: null, amount: null, category: null };
  if (!match) return { ...base, action: "conversation", reply: "Esse botão não é válido. Pode me dizer qual lembrete quer alterar?" };
  const [, action, reminderId, version] = match;
  return { ...base, action: action === "done" ? "complete_reminder" : "reschedule_reminder",
    reminderId, expectedVersion: Number(version),
    datetime: action === "done" ? null : new Date(receivedAt.getTime() + (action === "snooze10" ? 10 : 60) * 60_000).toISOString(),
    reply: "Vou conferir o lembrete.",
  };
}
