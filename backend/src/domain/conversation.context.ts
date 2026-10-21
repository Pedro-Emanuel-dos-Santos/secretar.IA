import type { PrismaClient } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { IncomingConversation } from "./conversation.processor";
import { findNotes } from "./notes";
import { parseInterpretation } from "./interpretation.validation";
import { mentionsName } from "./conversation.references";
type Store = Pick<PrismaClient, "user" | "reminder" | "incomingMessage" | "event" | "appointment" | "businessSubject" | "contactPreference">;

export async function conversationContext(store: Store, message: IncomingConversation) {
  const since = new Date(message.receivedAt.getTime() - 30 * 60_000);
  const [user, reminders, recent] = await Promise.all([
    store.user.findUnique({ where: { phone: message.phone }, select: { name: true, timezone: true } }),
    store.reminder.findMany({
      where: { ...reminderScope(message.phone, message.phoneNumberId), state: "active" },
      select: { id: true, title: true, remindAt: true, status: true, state: true, taskProgress:true, waitingFor:true,subjectId:true,subject:{select:{name:true,kind:true}}, seriesId: true, occurrenceIndex: true, recurrenceCount: true, recurrenceFrequency: true },
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
  let memories=notes;
  for(const row of draftHistory){
    try{const intent=parseInterpretation(JSON.stringify(row.interpretation));if(intent.action==="search_notes"){memories=await findNotes(store,message.phone,message.phoneNumberId,intent.search || "");break;}if(["save_note","edit_note","delete_note"].includes(intent.action))break;}catch{}
  }
  const [appointments,subjects,recentAlerts,preference]=await Promise.all([
    store.appointment.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,state:"active"},include:{reminders:{where:{state:"active"},select:{id:true,remindAt:true,appointmentOffsetMinutes:true}}},orderBy:{startsAt:"asc"},take:12}),
    store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true,kind:true,facts:{where:{supersededAt:null},select:{key:true,value:true,revision:true},take:5,orderBy:{createdAt:"desc"}}},orderBy:{updatedAt:"desc"},take:8}),
    store.reminder.findMany({where:{...reminderScope(message.phone,message.phoneNumberId),state:"active",status:"provider_accepted",deliveryStartedAt:{gte:new Date(message.receivedAt.getTime()-7*86400000),lte:message.receivedAt}},select:{id:true,title:true,remindAt:true,deliveryStartedAt:true,deliveryStatus:true,taskProgress:true,waitingFor:true},orderBy:[{deliveryStartedAt:"desc"},{id:"desc"}],take:3}),
    store.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:message.phoneNumberId,phone:message.phone}}}),
  ]);
  let pendingRequest: unknown=null,focusedReminder:unknown=null,focusedAppointment:unknown=null;
  let focusedSubject:{id:string;name:string;kind:string}|null=null;
  for(const row of draftHistory){
    if(row.receivedAt<since)break;
    let intent;try{intent=parseInterpretation(JSON.stringify(row.interpretation));}catch{continue;}
    if(intent.subject){
      // Recover by exact scoped name, including subjects outside the eight-row
      // context preview. A model-supplied pronoun is never a new identity.
      if(!mentionsName(row.text,intent.subject)){
        if(["search_facts","subject_overview","list_reminders"].includes(intent.action) && /\b(?:dele|dela|desse cliente|dessa cliente|desse projeto|dessa empresa|com ele|com ela)\b/i.test(row.text))continue;
        break;
      }
      const matches=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,kind:intent.subjectKind || "client",normalizedName:intent.subject.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()},select:{id:true,name:true,kind:true},take:2});
      const candidates=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{name:true},take:101});
      const named=candidates.filter(s=>mentionsName(row.text,s.name));
      if(matches.length===1 && candidates.length<=100 && named.length===1)focusedSubject=matches[0];
      break;
    }
    // A new unrelated operation ends the implicit client reference. Casual
    // conversation alone does not choose or replace a client.
    if(!["conversation","search_facts","subject_overview"].includes(intent.action))break;
  }
  // Resolve the latest appointment reference through persisted, scoped records.
  for(const row of draftHistory){
    let intent;try{intent=row.interpretation ? parseInterpretation(JSON.stringify(row.interpretation)):null;}catch{continue;}
    if(!intent)continue;
    const focused=intent.appointmentId ? await store.appointment.findFirst({where:{id:intent.appointmentId,user:{phone:message.phone},phoneNumberId:message.phoneNumberId}})
      : intent.action==="create_appointment" ? await store.appointment.findFirst({where:{sourceMessage:{phone:message.phone,phoneNumberId:message.phoneNumberId,text:row.text,receivedAt:row.receivedAt}}}) : null;
    if(focused){focusedAppointment=focused;break;}
    if(["create_reminder","reschedule_reminder","cancel_reminder","complete_reminder"].includes(intent.action))break;
  }
  for(const row of draftHistory){
    let intent;
    try{intent=row.interpretation ? parseInterpretation(JSON.stringify(row.interpretation)) : null;}catch{continue;}
    if(!focusedReminder){
      const focused=row.reminder || reminders.find(r=>r.id===intent?.reminderId);
      if(focused)focusedReminder=focused;
    }
    if(row.reminder || intent?.action==="discard_draft" || ["reschedule_reminder","create_appointment","reschedule_appointment"].includes(intent?.action || "") && intent?.datetime)break;
    if(intent?.draft && ["create_reminder","reschedule_reminder","create_appointment","reschedule_appointment"].includes(intent.action)){
      pendingRequest={action:intent.action,title:intent.title,description:intent.description,draft:intent.draft,
        recurrence:intent.recurrence || null,reminderId:intent.reminderId || null,appointmentId:intent.appointmentId || null,alertMinutes:intent.alertMinutes,subject:intent.subject,subjectKind:intent.subjectKind,search:intent.search || null,
        originalMessage:row.text.slice(0,1000),receivedAt:row.receivedAt.toISOString()};break;
    }
  }
  return {
    now: message.receivedAt.toISOString(), processingAt: new Date().toISOString(), user:{name:preference?.displayName || user?.name || null,timezone:preference?.timezone || user?.timezone || "America/Sao_Paulo"},
    preferences:{onboarded:!!preference?.onboardedAt,businessType:preference?.businessType || null,audioConsent:preference?.audioConsent || false},
    currentMessage: message.text, memories, subjects, appointments, recentAlerts, habits: [],
    conversationState:{pendingRequest,focusedReminder,focusedAppointment,focusedSubject,latestReminderNotice:recentAlerts.find(r=>r.deliveryStatus!=="failed") || null,draftWindowDays:7,notesSearchAvailable:true,factsSearchAvailable:true},
    reminders: reminders.map(r => ({ ...r, title: r.title.slice(0, 160) })),
    lastMessages: recent.reverse().map(row => ({
      user: row.text.slice(0, 1000), receivedAt: row.receivedAt.toISOString(),
      assistant: row.reply?.status === "provider_accepted" ? row.reply.text.slice(0, 1000) : null,
      createdReminder: row.reminder ? { ...row.reminder, title: row.reminder.title.slice(0, 160) } : null,
    })),
    contextWindowMinutes: 30,
  };
}
