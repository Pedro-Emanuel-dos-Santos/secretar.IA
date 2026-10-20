import { receiveDeliveryReceipts } from "../domain/delivery.receipts";
import { prisma } from "../config/prisma";
import { createWebhookRouter } from "../http/webhook.handlers";

export const webhookRoutes = createWebhookRouter(prisma.incomingMessage, () => ({
  appSecret: process.env.WHATSAPP_APP_SECRET,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
}), (payload, phoneNumberId) => receiveDeliveryReceipts(payload, phoneNumberId, prisma));
