import { AIInterpretation } from "../types/ai.types";
import { parseInterpretation } from "./interpretation.validation";
import { relativeReminderTime, relativeRescheduleTime } from "./relative-time";
import { buttonInterpretation } from "./reminder.buttons";
import { localCommandIntent } from "./local.commands";
import { hasMultipleInitialTimes } from "./multiple-times";
import { guardUnstatedTime, guardCorrectionTarget, explicitClock } from "./conversation.timing";
import { guardFactLookup } from "./conversation.reads";

export type IncomingConversation = { phone: string; text: string; receivedAt: Date; phoneNumberId: string; mediaId?: string | null };
export type ConversationDependencies = {
  buildContext(message: IncomingConversation): Promise<unknown>;
  interpret(context: any): Promise<AIInterpretation>;
  transcribe?(message: {mediaId: string; mediaMimeType: string | null; phoneNumberId: string; phone: string}): Promise<string>;
};

export async function prepareConversation(message: IncomingConversation, deps: ConversationDependencies, timeoutMs = 45000) {
  const button = !message.mediaId && buttonInterpretation(message.text, message.receivedAt);
  if (button) return button;
  const command = localCommandIntent(message.text);
  if (command) return command;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const context = await deps.buildContext(message);
      const interpretation = await deps.interpret(context);
      const validated = parseInterpretation(JSON.stringify(interpretation));
      // Optimistic version checks are attached by our deterministic button parser,
      // not invented by the language model.
      delete validated.expectedVersion;
      guardFactLookup(validated,message.text,context);
      guardCorrectionTarget(validated,message.text,context);
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
      }
      return validated;
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Preparação sem resposta no prazo.")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
