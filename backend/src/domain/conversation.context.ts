import type { PrismaClient } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { IncomingConversation } from "./conversation.processor";
import { findNotes } from "./notes";
import { parseInterpretation } from "./interpretation.validation";
type Store = Pick<PrismaClient, "user" | "reminder" | "incomingMessage" | "event">;

export async function conversationContext(store: Store, message: IncomingConversation) {
  const since = new Date(message.receivedAt.getTime() - 30 * 60_000);
  const [user, reminders, recent] = await Promise.all([
    store.user.findUnique({ where: { phone: message.phone }, select: { name: true, timezone: true } }),
    store.reminder.findMany({
      where: { ...reminderScope(message.phone, message.phoneNumberId), state: "active" },
      select: { id: true, title: true, remindAt: true, status: true, state: true, seriesId: true, occurrenceIndex: true, recurrenceCount: true, recurrenceFrequency: true },
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
  // Drafts survive process restarts and short interruptions because they come
  // from committed interpretations, rather than an in-memory chat session.
  const [draftHistory,notes]=await Promise.all([
    store.incomingMessage.findMany({where:{phone:message.phone,phoneNumberId:message.phoneNumberId,
      receivedAt:{gte:new Date(message.receivedAt.getTime()-7*86400000),lte:message.receivedAt},
      status:{in:["reply_pending","reply_sending","completed","reply_unknown"]}},
      orderBy:[{receivedAt:"desc"},{id:"desc"}],take:20,
      select:{text:true,receivedAt:true,interpretation:true,reminder:{select:{id:true,title:true,remindAt:true,status:true,state:true}}}}),
    findNotes(store,message.phone,message.phoneNumberId),
  ]);
  let pendingRequest: unknown=null,focusedReminder:unknown=null;
  for(const row of draftHistory){
    let intent;
    try{intent=row.interpretation ? parseInterpretation(JSON.stringify(row.interpretation)) : null;}catch{continue;}
    if(!focusedReminder){
      const focused=row.reminder || reminders.find(r=>r.id===intent?.reminderId);
      if(focused)focusedReminder=focused;
    }
    if(row.reminder || intent?.action==="discard_draft" || intent?.action==="reschedule_reminder" && intent.datetime)break;
    if(intent?.draft && ["create_reminder","reschedule_reminder"].includes(intent.action)){
      pendingRequest={action:intent.action,title:intent.title,description:intent.description,draft:intent.draft,
        recurrence:intent.recurrence || null,reminderId:intent.reminderId || null,search:intent.search || null,
        originalMessage:row.text.slice(0,1000),receivedAt:row.receivedAt.toISOString()};break;
    }
  }
  return {
    now: message.receivedAt.toISOString(), processingAt: new Date().toISOString(), user,
    currentMessage: message.text, memories: notes, habits: [],
    conversationState:{pendingRequest,focusedReminder,draftWindowDays:7,notesSearchAvailable:true},
    reminders: reminders.map(r => ({ ...r, title: r.title.slice(0, 160) })),
    lastMessages: recent.reverse().map(row => ({
      user: row.text.slice(0, 1000), receivedAt: row.receivedAt.toISOString(),
      assistant: row.reply?.status === "provider_accepted" ? row.reply.text.slice(0, 1000) : null,
      createdReminder: row.reminder ? { ...row.reminder, title: row.reminder.title.slice(0, 160) } : null,
    })),
    contextWindowMinutes: 30,
  };
}
