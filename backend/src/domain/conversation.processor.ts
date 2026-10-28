import { AIInterpretation } from "../types/ai.types";
import { parseInterpretation } from "./interpretation.validation";
import { relativeReminderTime, relativeRescheduleTime } from "./relative-time";
import { buttonInterpretation } from "./reminder.buttons";
import { localCommandIntent } from "./local.commands";
import { hasMultipleInitialTimes } from "./multiple-times";
import { guardUnstatedTime, guardCorrectionTarget, explicitClock } from "./conversation.timing";
import { guardFactLookup,guardAppointmentLookup } from "./conversation.reads";
import { guardSubjectReference, mentionsName } from "./conversation.references";
import type { UsageObserver } from "./ai.usage";
import { applyTaskSelection } from "./task.selection";
import { preserveRescheduleParts } from "./reschedule.parts";
import { guardSubjectPeriod } from "./agenda.period";
import { socialAcknowledgement } from "./conversation.social";
import { guardCurrentTarget } from "./conversation.target";
import {guardAppointmentDuration} from "./appointment.duration";
import {chooseAppointmentSuggestion} from "./appointment.suggestions";
import {subjectProposalCommand} from "./subject.proposal";
import {pendingFollowupIntent} from "./subject.pending.followup";
import {subjectHistoryLookup} from "./subject.history.lookup";

export type IncomingConversation = { phone: string; text: string; receivedAt: Date; phoneNumberId: string; mediaId?: string | null };
export type ConversationDependencies = {
  buildContext(message: IncomingConversation): Promise<unknown>;
  interpret(context: any,onUsage?:UsageObserver): Promise<AIInterpretation>;
  onUsage?:UsageObserver;
  transcribe?(message: {mediaId: string; mediaMimeType: string | null; phoneNumberId: string; phone: string}): Promise<string>;
};

export async function prepareConversation(message: IncomingConversation, deps: ConversationDependencies, timeoutMs = 45000) {
  const proposalCommand=!message.mediaId && subjectProposalCommand(message.text);
  if(proposalCommand)return proposalCommand;
  const button = !message.mediaId && buttonInterpretation(message.text, message.receivedAt);
  if (button) return button;
  const command = localCommandIntent(message.text);
  if (command) return command;
  const acknowledgement=socialAcknowledgement(message.text);
  if(acknowledgement)return acknowledgement;
  const historyLookup=!message.mediaId && subjectHistoryLookup(message.text);
  if(historyLookup)return historyLookup;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const context = await deps.buildContext(message);
      const followup=pendingFollowupIntent((context as any)?.conversationState?.pendingFollowup || null);
      if(followup)return followup;
      const continuation=(context as any)?.conversationState?.pendingContinuation;
      if(continuation?.intent)return continuation.intent as AIInterpretation;
      const interpretation = await deps.interpret(context,deps.onUsage);
      const validated = parseInterpretation(JSON.stringify(interpretation));
      // Optimistic version checks are attached by our deterministic button parser,
      // not invented by the language model.
      delete validated.expectedVersion;
      delete validated.subjectPendingId;
      delete validated.expectedSubjectId;
      delete validated.appointmentSuggestionId;delete validated.appointmentSuggestionIndex;
      applyTaskSelection(validated,message.text,(context as any)?.conversationState?.shownTaskList || null,(context as any)?.conversationState?.selectedTask || null);
      guardCurrentTarget(validated,message.text,context);
      if(validated.action==="set_task_subject"){
        const normalized=message.text.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const removal=/\b(?:tira|tire|retira|retire|remove|remova|remover|desvincula|desvincule|desvincular|sem cliente|sem projeto)\b/i.test(normalized) && !/\b(?:nao|nunca|talvez|se)\b/i.test(normalized);
        if(validated.clearSubject ? !removal : !validated.subject || !mentionsName(message.text,validated.subject))return {action:"conversation" as const,title:null,description:null,datetime:null,amount:null,category:null,reply:"Qual cliente ou projeto você quer vincular à tarefa? Para retirar o vínculo, diga isso explicitamente."};
        const task=(context as any)?.reminders?.find((r:any)=>r.id===validated.reminderId);
        if(task && Number.isSafeInteger(task.scheduleVersion)){validated.expectedVersion=task.scheduleVersion;validated.expectedSubjectId=task.subjectId ?? null;}
      }
      if(["edit_note","delete_note"].includes(validated.action) && validated.noteId){
        const note=(context as any)?.memories?.find((n:any)=>n.id===validated.noteId);
        if(note && Number.isSafeInteger(note.version))validated.expectedVersion=note.version;
      }
      if(["update_personal","forget_personal"].includes(validated.action) && validated.memoryId){
        const memory=(context as any)?.personalMemories?.find((m:any)=>m.id===validated.memoryId);
        if(memory && Number.isSafeInteger(memory.version))validated.expectedVersion=memory.version;
      }
      guardFactLookup(validated,message.text,context);
      guardAppointmentLookup(validated,message.text,context);
      guardSubjectReference(validated,message.text,context);
      guardSubjectPeriod(validated,message.text,context);
      if(validated.action==="create_reminder" && validated.subject){
        const pending=(context as any)?.conversationState?.pendingRequest;
        const carried=pending?.action==="create_reminder" && pending.subject===validated.subject && typeof pending.originalMessage==="string" && mentionsName(pending.originalMessage,validated.subject);
        if(!mentionsName(message.text,validated.subject) && !carried)return {action:"conversation" as const,title:null,description:null,datetime:null,amount:null,category:null,reply:"Qual é o nome do cliente ou projeto que devo vincular a essa tarefa?"};
      }
      guardCorrectionTarget(validated,message.text,context);
      guardAppointmentDuration(validated,message.text,context);
      if (["create_reminder","create_appointment"].includes(validated.action)) {
        if(validated.action==="create_appointment" && hasMultipleInitialTimes(message.text)){
          const normalized=message.text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
          const event=/\b(?:reuniao|consulta|visita|atendimento|compromisso|entrevista|aula)\b/;
          const parts=normalized.split(/\s+e\s+|;|\bdepois\b|\btambem\b/);
          if(event.test(parts[0]) && parts.slice(1).some(part=>{
            const eventIndex=part.search(event),alertIndex=part.search(/\b(?:aviso|avisa|avise|avisar|lembra|lembre)\b/);
            return eventIndex>=0 && explicitClock(part) && (alertIndex<0 || eventIndex<alertIndex);
          }))return {action:"conversation" as const,title:null,description:null,datetime:null,amount:null,category:null,
            reply:"Você pediu mais de um compromisso. Qual deles quer registrar primeiro?"};
        }
        if(validated.action==="create_reminder" && hasMultipleInitialTimes(message.text))return {action:"conversation" as const,title:null,description:null,datetime:null,amount:null,category:null,
          reply:"Consigo preparar uma tarefa com um horário inicial por mensagem. Qual tarefa e horário você quer registrar primeiro?"};
        const relative = validated.action==="create_appointment" && explicitClock(message.text) ? null : relativeReminderTime(message.text, message.receivedAt);
        if (relative) validated.datetime = relative;
        else guardUnstatedTime(validated,message.text,context);
      }
      if (["reschedule_reminder","reschedule_appointment"].includes(validated.action)) {
        const relative = validated.action==="reschedule_appointment" && explicitClock(message.text) ? null : relativeRescheduleTime(message.text, message.receivedAt);
        if (relative) validated.datetime = relative;
        else preserveRescheduleParts(validated,message.text,context,message.receivedAt);
      }
      chooseAppointmentSuggestion(validated,message.text,(context as any)?.conversationState?.appointmentSuggestions || null);
      return validated;
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Preparação sem resposta no prazo.")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
