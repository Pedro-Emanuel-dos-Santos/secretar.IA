import { Request, Response } from "express";
import { handleIncomingMessage } from "../services/conversation.service";

const VERIFY_TOKEN = "secretaria_ia_verify_token";

export function verifyWebhookController(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado pela Meta");
    return res.status(200).send(challenge);
  }

  console.log("❌ Falha na verificação do webhook");
  return res.sendStatus(403);
}

export async function receiveWebhookController(req: Request, res: Response) {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text.body;

    console.log("📱 Mensagem recebida de:", from);
    console.log("💬 Texto:", text);

    await handleIncomingMessage(from, text);

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Erro no webhook:", error);
    return res.sendStatus(200);
  }
}