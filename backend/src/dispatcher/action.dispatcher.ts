import { AIInterpretation } from "../types/ai.types";
import { executeReminderAction } from "../actions/reminder.action";

export async function dispatchAction(
  phone: string,
  interpretation: AIInterpretation
) {
  switch (interpretation.action) {
    case "create_reminder":
      await executeReminderAction(phone, interpretation);
      break;

    case "conversation":
      break;

    case "unknown":
      break;

    default:
      console.log("Ação ainda não implementada:", interpretation.action);
  }
}