import { buildContext } from "../context/context.builder";
import { interpretMessage } from "./ai.service";
import { ConversationDependencies } from "../domain/conversation.processor";
import { transcribeWhatsAppAudio } from "./audio.service";

export const conversationDependencies: ConversationDependencies = {
  buildContext: message => buildContext(message.phone, message.text, message.receivedAt, message.phoneNumberId),
  interpret: interpretMessage,
  transcribe: transcribeWhatsAppAudio,
};
