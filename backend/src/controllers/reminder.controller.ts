import { createReminder } from "../services/reminder.service";
import { createReminderHandler } from "../http/reminder.handlers";

export const createReminderController = createReminderHandler(createReminder);
