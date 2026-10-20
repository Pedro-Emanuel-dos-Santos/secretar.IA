import { AIInterpretation } from "../types/ai.types";
import { parseInterpretation } from "./interpretation.validation";
import { relativeReminderTime, relativeRescheduleTime } from "./relative-time";

export type IncomingConversation = { phone: string; text: string; receivedAt: Date; phoneNumberId: string };
export type ConversationDependencies = {
  buildContext(message: IncomingConversation): Promise<unknown>;
  interpret(context: any): Promise<AIInterpretation>;
};

export async function prepareConversation(message: IncomingConversation, deps: ConversationDependencies, timeoutMs = 45000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const context = await deps.buildContext(message);
      const interpretation = await deps.interpret(context);
      const validated = parseInterpretation(JSON.stringify(interpretation));
      if (validated.action === "create_reminder") {
        const relative = relativeReminderTime(message.text, message.receivedAt);
        if (relative) validated.datetime = relative;
      }
      if (validated.action === "reschedule_reminder") {
        const relative = relativeRescheduleTime(message.text, message.receivedAt);
        if (relative) validated.datetime = relative;
      }
      return validated;
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Preparação sem resposta no prazo.")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
