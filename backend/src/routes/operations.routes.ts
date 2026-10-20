import { prisma } from "../config/prisma";
import { createOperationsRouter } from "../http/operations.handlers";

export const operationsRoutes = createOperationsRouter(prisma, {
  adminToken: () => process.env.ADMIN_API_TOKEN,
  phoneNumberId: () => process.env.WHATSAPP_PHONE_NUMBER_ID,
});
