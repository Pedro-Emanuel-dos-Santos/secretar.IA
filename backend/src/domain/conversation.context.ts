import type { PrismaClient } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { IncomingConversation } from "./conversation.processor";
import { findNotes } from "./notes";
import { parseInterpretation } from "./interpretation.validation";
import { mentionsName } from "./conversation.references";
import { shownTaskList,shownTaskFocus } from "./task.selection";
import { recentConversationFocus } from "./conversation.focus";
import { findPersonalMemories,personalMemoryActions } from "./personal.memory";
import { personalMemoryPolicy } from "./personal.memory.consent";
import {shownAppointmentSuggestions} from "./appointment.suggestions";
import {pendingFollowupContext,subjectFromPendingAudit} from "./subject.pending.followup";
import {pendingContinuation} from "./pending.continuation";
import {availableAssistantPlan,assistantPlanCommand} from "./assistant.plan";
import {retrieveContext} from "./context.retrieval";
type Store = Pick<PrismaClient, "user" | "reminder" | "incomingMessage" | "event" | "appointment" | "businessSubject" | "contactPreference" | "subjectPending">;

export async function conversationContext(store: Store, message: IncomingConversation) {
  const since = new Date(message.receivedAt.getTime() - 30 * 60_000);
  const [user, reminders, recent] = await Promise.all([
    store.user.findUnique({ where: { phone: message.phone }, select: { name: true, timezone: true } }),
    store.reminder.findMany({
      where: { ...reminderScope(message.phone, message.phoneNumberId), state: "active" },
      select: { id: true, title: true, remindAt: true, status: true, state: true, taskProgress:true, waitingFor:true,subjectId:true,scheduleVersion:true,subject:{select:{name:true,kind:true}}, seriesId: true, occurrenceIndex: true, recurrenceCount: true, recurrenceFrequency: true },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: 12,
    }),
    store.incomingMessage.findMany({
      where: { phone: message.phone, phoneNumberId: message.phoneNumberId,
        receivedAt: { gte: since, lte: message.receivedAt },
        status: { in: ["reply_pending", "reply_sending", "completed", "reply_unknown"] } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 4,
      select: { text: true, receivedAt: true,interpretation:true,
        reply: { select: { text: true, status: true } },
        reminder: { select: { id: true, title: true, remindAt: true, status: true, state: true,scheduleVersion:true } } },
    }),
  ]);
  // Drafts survive process restarts and short interruptions because they come
  // from committed interpretations, rather than an in-memory chat session.
  const [draftHistory,notes]=await Promise.all([
    store.incomingMessage.findMany({where:{phone:message.phone,phoneNumberId:message.phoneNumberId,
      receivedAt:{gte:new Date(message.receivedAt.getTime()-7*86400000),lte:message.receivedAt},
      status:{in:["reply_pending","reply_sending","completed","reply_unknown"]}},
      orderBy:[{receivedAt:"desc"},{id:"desc"}],take:20,
      select:{id:true,text:true,receivedAt:true,interpretation:true,reply:{select:{status:true,finishedAt:true}},appointment:{select:{id:true}},reminder:{select:{id:true,title:true,remindAt:true,status:true,state:true,scheduleVersion:true}}}}),
    findNotes(store,message.phone,message.phoneNumberId),
  ]);
  let memories=notes;
  const memoryPolicy=await personalMemoryPolicy(store,message.phone,message.phoneNumberId),memoryEnabled=memoryPolicy.enabled;
  let personalMemories=memoryEnabled?await findPersonalMemories(store,message.phone,message.phoneNumberId):[];
  if(memoryEnabled)for(const row of draftHistory){
    try{const intent=parseInterpretation(JSON.stringify(row.interpretation));if(intent.action==="recall_personal"){personalMemories=await findPersonalMemories(store,message.phone,message.phoneNumberId,intent.search || "");break;}if(["remember_personal","update_personal","forget_personal"].includes(intent.action))break;}catch{}
  }
  for(const row of draftHistory){
    try{const intent=parseInterpretation(JSON.stringify(row.interpretation));if(intent.action==="search_notes"){memories=await findNotes(store,message.phone,message.phoneNumberId,intent.search || "");break;}if(["save_note","edit_note","delete_note"].includes(intent.action))break;}catch{}
  }
  const [appointments,subjects,recentAlerts,preference,subjectPendings]=await Promise.all([
    store.appointment.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,state:"active"},include:{reminders:{where:{state:"active"},select:{id:true,remindAt:true,appointmentOffsetMinutes:true}}},orderBy:{startsAt:"asc"},take:12}),
    store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true,kind:true,facts:{where:{supersededAt:null},select:{key:true,value:true,revision:true},take:5,orderBy:{createdAt:"desc"}}},orderBy:{updatedAt:"desc"},take:8}),
    store.reminder.findMany({where:{...reminderScope(message.phone,message.phoneNumberId),state:"active",status:"provider_accepted",deliveryStartedAt:{gte:new Date(message.receivedAt.getTime()-7*86400000),lte:message.receivedAt}},select:{id:true,title:true,remindAt:true,deliveryStartedAt:true,deliveryStatus:true,taskProgress:true,waitingFor:true},orderBy:[{deliveryStartedAt:"desc"},{id:"desc"}],take:3}),
    store.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:message.phoneNumberId,phone:message.phone}}}),
    store.subjectPending.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,state:{in:["pending","waiting"]}},select:{title:true,state:true,waitingFor:true,nextAction:true,updatedAt:true,subject:{select:{name:true,kind:true}}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:12}),
  ]);
  let pendingRequest: unknown=null;
  const {focusedReminder,focusedAppointment}=await recentConversationFocus(store,message.phone,message.phoneNumberId,message.receivedAt,draftHistory);
  const taskList=await shownTaskList(store,message.phone,message.phoneNumberId,message.receivedAt);
  const selectedTask=await shownTaskFocus(store,message.phone,message.phoneNumberId,message.receivedAt);
  const appointmentSuggestions=await shownAppointmentSuggestions(store,message.phone,message.phoneNumberId,message.receivedAt);
  let focusedSubject:{id:string;name:string;kind:string}|null=null;
  for(const row of draftHistory){
    if(row.receivedAt<since)break;
    let intent;try{intent=parseInterpretation(JSON.stringify(row.interpretation));}catch{continue;}
    if(intent.action==="update_subject_pending" && intent.subjectPendingId){
      if(row.reply?.status==="provider_accepted" && row.reply.finishedAt && row.reply.finishedAt<=message.receivedAt)focusedSubject=await subjectFromPendingAudit(store,message.phone,message.phoneNumberId,row.id,intent.subjectPendingId);
      break;
    }
    if(intent.action==="confirm_subject_update"){
      if(row.reply?.status!=="provider_accepted" || !row.reply.finishedAt || row.reply.finishedAt>message.receivedAt)break;
      const applied=await store.event.findFirst({where:{type:"subject_update_proposal",user:{phone:message.phone},AND:[{payload:{path:["phoneNumberId"],equals:message.phoneNumberId}},{payload:{path:["confirmationMessageId"],equals:row.id}},{payload:{path:["status"],equals:"applied"}}]},orderBy:{createdAt:"desc"}});
      const subjectId=(applied?.payload as {subjectId?:unknown}|null)?.subjectId;
      if(typeof subjectId==="string")focusedSubject=await store.businessSubject.findFirst({where:{id:subjectId,user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true,kind:true}});
      break;
    }
    if(intent.subject){
      // Recover by exact scoped name, including subjects outside the eight-row
      // context preview. A model-supplied pronoun is never a new identity.
      if(!mentionsName(row.text,intent.subject)){
        if(["search_facts","subject_overview","agenda_overview","list_reminders","list_subject_pendings"].includes(intent.action) && /\b(?:dele|dela|desse cliente|dessa cliente|desse projeto|dessa empresa|com ele|com ela)\b/i.test(row.text))continue;
        break;
      }
      const matches=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,kind:intent.subjectKind || "client",normalizedName:intent.subject.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()},select:{id:true,name:true,kind:true},take:2});
      const kindSpecified=(intent.subjectKind || "client")==="project"?/\bprojeto\b/i.test(row.text):/\bcliente\b/i.test(row.text);
      const candidates=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,...(kindSpecified?{kind:intent.subjectKind || "client"}:{})},select:{name:true},take:101});
      const named=candidates.filter(s=>mentionsName(row.text,s.name));
      if(matches.length===1 && candidates.length<=100 && named.length===1)focusedSubject=matches[0];
      break;
    }
    // A new unrelated operation ends the implicit client reference. Casual
    // conversation alone does not choose or replace a client.
    if(!["conversation","search_facts","subject_overview","agenda_overview","list_subject_pendings"].includes(intent.action))break;
  }
  for(const row of draftHistory){
    let intent;
    try{intent=row.interpretation ? parseInterpretation(JSON.stringify(row.interpretation)) : null;}catch{continue;}
    if(["propose_subject_update","confirm_subject_update","discard_subject_update","create_subject_pending","update_subject_pending"].includes(intent?.action || ""))break;
    if(row.reminder || intent?.action==="discard_draft" || ["reschedule_reminder","create_appointment","reschedule_appointment"].includes(intent?.action || "") && intent?.datetime)break;
    if(intent?.draft && ["create_reminder","reschedule_reminder","create_appointment","reschedule_appointment"].includes(intent.action)){
      pendingRequest={action:intent.action,title:intent.title,description:intent.description,draft:intent.draft,
        recurrence:intent.recurrence || null,reminderId:intent.reminderId || null,appointmentId:intent.appointmentId || null,alertMinutes:intent.alertMinutes,durationMinutes:intent.durationMinutes,subject:intent.subject,subjectKind:intent.subjectKind,search:intent.search || null,
        originalMessage:row.text.slice(0,1000),receivedAt:row.receivedAt.toISOString()};break;
    }
  }
  const pendingFollowup=await pendingFollowupContext(store,message);
  // A selected timed task has its own identity/version protocol. Do not steal
  // “pode concluir” from that existing flow to treat it as an untimed pending.
  const pendingContinuationContext=pendingFollowup || selectedTask?null:await pendingContinuation(store,message);
  const assistantPlan=assistantPlanCommand(message.text) || draftHistory.some(row=>(row.interpretation as {action?:string}|null)?.action==="assistant_plan")?await availableAssistantPlan(store,message):null;
  const contextualMemory=await retrieveContext(store,message.phone,message.phoneNumberId,message.text,message.receivedAt);
  return {
    now: message.receivedAt.toISOString(), processingAt: new Date().toISOString(), user:{name:preference?.displayName || user?.name || null,timezone:preference?.timezone || user?.timezone || "America/Sao_Paulo"},
    preferences:{onboarded:!!preference?.onboardedAt,businessType:preference?.businessType || null,audioConsent:preference?.audioConsent || false},
    currentMessage: message.text, memories, personalMemories:personalMemories.slice(0,10),personalMemoryEnabled:memoryEnabled, subjects, subjectPendings, appointments, recentAlerts, habits: [],contextualMemory,
    conversationState:{pendingRequest,focusedReminder,focusedAppointment,focusedSubject,pendingFollowup,pendingContinuation:pendingContinuationContext,assistantPlan:assistantPlan?{id:assistantPlan.event.id,expired:assistantPlan.expired,steps:assistantPlan.data.request?.planSteps}:null,shownTaskList:taskList,selectedTask,appointmentSuggestions,latestReminderNotice:recentAlerts.find(r=>r.deliveryStatus!=="failed") || null,focusWindowMinutes:30,draftWindowDays:7,notesSearchAvailable:true,factsSearchAvailable:true},
    reminders: reminders.map(r => ({ ...r, title: r.title.slice(0, 160) })),
    lastMessages: recent.reverse().filter(row=>{
      const storageAction=(row.interpretation as {action?:string}|null)?.action;
      // Current records replace past storage instructions, including deleted
      // memories and notes. Never resurrect them from the presentation history.
      if(personalMemoryActions.has(storageAction || "") || ["save_note","edit_note","search_notes","delete_note"].includes(storageAction || ""))return false;
      if(memoryEnabled)return true;
      if(memoryPolicy.omitHistory || memoryPolicy.hideHistoryBefore && row.receivedAt<=memoryPolicy.hideHistoryBefore)return false;
      const action=(row.interpretation as {action?:string}|null)?.action;
      return !personalMemoryActions.has(action || "") && !/^minhas memorias[.!?]*$/.test(row.text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim());
    }).map(row => ({
      user: row.text.slice(0, 1000), receivedAt: row.receivedAt.toISOString(),
      assistant: row.reply?.status === "provider_accepted" ? row.reply.text.slice(0, 1000) : null,
      createdReminder: row.reminder ? { ...row.reminder, title: row.reminder.title.slice(0, 160) } : null,
    })),
    contextWindowMinutes: 30,
  };
}
