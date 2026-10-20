import { prisma } from "../config/prisma";
import { conversationContext } from "../domain/conversation.context";

export async function buildContext(phone: string, currentMessage: string, receivedAt = new Date(), phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID) {
  if (!phoneNumberId) throw new Error("Configure o número comercial antes de construir contexto.");
  return conversationContext(prisma, { phone, text: currentMessage, receivedAt, phoneNumberId });
}
