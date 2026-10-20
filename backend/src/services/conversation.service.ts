import { buildContext } from "../context/context.builder";
import { interpretMessage } from "./ai.service";
import { ConversationDependencies } from "../domain/conversation.processor";

export const conversationDependencies: ConversationDependencies = {
  buildContext: message => buildContext(message.phone, message.text, message.receivedAt, message.phoneNumberId),
  interpret: interpretMessage,
};
