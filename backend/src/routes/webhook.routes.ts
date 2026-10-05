import { Router } from "express";
import {
  receiveWebhookController,
  verifyWebhookController,
} from "../controllers/webhook.controller";

export const webhookRoutes = Router();

webhookRoutes.get("/webhook", verifyWebhookController);
webhookRoutes.post("/webhook", receiveWebhookController);