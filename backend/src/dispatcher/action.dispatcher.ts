import { AIInterpretation } from "../types/ai.types";
import { createReminder } from "../services/reminder.service";
import { executeAction } from "../domain/action.executor";

export function dispatchAction(phone: string, interpretation: AIInterpretation, sourceMessageId?: string) {
  return executeAction(phone, interpretation, data => createReminder(data, sourceMessageId));
}
