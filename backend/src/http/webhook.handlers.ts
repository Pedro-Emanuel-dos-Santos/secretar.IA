import express, { Request, Response, Router } from "express";
import { verifyChallenge, verifySignature } from "../domain/webhook.security";
import { InboxWriter, InvalidWebhookError, receiveMessages } from "../domain/inbox.receiver";

type Configuration = { appSecret?: string; verifyToken?: string; phoneNumberId?: string };

export function createWebhookRouter(inbox: InboxWriter, configuration: () => Configuration, receiveStatuses?: (payload: unknown, phoneNumberId: string) => Promise<unknown>): Router {
  const router = Router();
  router.get("/webhook", (req: Request, res: Response) => {
    const config = configuration();
    if (!config.verifyToken) return res.sendStatus(503);
    const challenge = verifyChallenge(req.query, config.verifyToken);
    return challenge === null ? res.sendStatus(403) : res.status(200).type("text/plain").send(challenge);
  });
  // This router must be mounted before express.json(): HMAC uses the exact bytes.
  router.post("/webhook", express.raw({ type: "application/json", limit: "1mb", inflate: false }), async (req: Request, res: Response) => {
    const config = configuration();
    if (!config.appSecret || !config.phoneNumberId) return res.sendStatus(503);
    if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.headers["x-hub-signature-256"], config.appSecret)) return res.sendStatus(401);
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
    try {
      await receiveMessages(payload, config.phoneNumberId, inbox);
      if (receiveStatuses) await receiveStatuses(payload, config.phoneNumberId);
      return res.sendStatus(200);
    } catch (error) {
      if (error instanceof InvalidWebhookError) return res.sendStatus(400);
      console.error("Webhook não persistido; aguardando reentrega do provedor.");
      return res.sendStatus(503);
    }
  });
  return router;
}
