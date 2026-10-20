import "dotenv/config";
import { resolveWhatsAppRecipient } from "../domain/whatsapp.recipient";
import { prisma } from "../config/prisma";
import { whatsappPayload } from "../domain/whatsapp.policy";

export async function sendWhatsAppMessage(phone: string, message: string, kind: "reply" | "reminder" = "reply") {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiUrl = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v23.0";
  if (!phoneNumberId || !token) throw new Error("Configure as credenciais de envio do WhatsApp.");
  const latest = await prisma.incomingMessage.findFirst({
    where: { phone, phoneNumberId }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true },
  });
  const body = whatsappPayload(resolveWhatsAppRecipient(phone, process.env.WHATSAPP_RECIPIENT_MAP), message,
    latest?.receivedAt ?? null, kind, {
      name: process.env.WHATSAPP_REMINDER_TEMPLATE_NAME,
      language: process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || "pt_BR",
      approved: process.env.WHATSAPP_REMINDER_TEMPLATE_APPROVED === "true",
    });

  const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erro HTTP ao enviar WhatsApp:", response.status);
    throw new Error("Erro ao enviar WhatsApp");
  }

  return data;
}

export const sendWhatsAppReminder = (phone: string, message: string) => sendWhatsAppMessage(phone, message, "reminder");
