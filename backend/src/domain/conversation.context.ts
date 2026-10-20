import type { PrismaClient } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { IncomingConversation } from "./conversation.processor";
type Store = Pick<PrismaClient, "user" | "reminder" | "incomingMessage">;

export async function conversationContext(store: Store, message: IncomingConversation) {
  const since = new Date(message.receivedAt.getTime() - 30 * 60_000);
  const [user, reminders, recent] = await Promise.all([
    store.user.findUnique({ where: { phone: message.phone }, select: { name: true, timezone: true } }),
    store.reminder.findMany({
      where: { ...reminderScope(message.phone, message.phoneNumberId), state: "active" },
      select: { id: true, title: true, remindAt: true, status: true, state: true },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: 12,
    }),
    store.incomingMessage.findMany({
      where: { phone: message.phone, phoneNumberId: message.phoneNumberId,
        receivedAt: { gte: since, lte: message.receivedAt },
        status: { in: ["reply_pending", "reply_sending", "completed", "reply_unknown"] } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 4,
      select: { text: true, receivedAt: true,
        reply: { select: { text: true, status: true } },
        reminder: { select: { id: true, title: true, remindAt: true, status: true, state: true } } },
    }),
  ]);
  return {
    now: message.receivedAt.toISOString(), processingAt: new Date().toISOString(), user,
    currentMessage: message.text, memories: [], habits: [],
    reminders: reminders.map(r => ({ ...r, title: r.title.slice(0, 160) })),
    lastMessages: recent.reverse().map(row => ({
      user: row.text.slice(0, 1000), receivedAt: row.receivedAt.toISOString(),
      assistant: row.reply?.status === "provider_accepted" ? row.reply.text.slice(0, 1000) : null,
      createdReminder: row.reminder ? { ...row.reminder, title: row.reminder.title.slice(0, 160) } : null,
    })),
    contextWindowMinutes: 30,
  };
}
