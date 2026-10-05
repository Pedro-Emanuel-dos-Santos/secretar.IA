import { buildContext } from "../context/context.builder";
import { interpretMessage } from "./ai.service";
import { dispatchAction } from "../dispatcher/action.dispatcher";
import { sendWhatsAppMessage } from "./whatsapp.service";

export async function handleIncomingMessage(
  phone: string,
  message: string
) {

  console.log("🧠 Construindo contexto...");

  const context = await buildContext(phone, message);

  console.log(context);

  const interpretation = await interpretMessage(context);

  console.log("🤖 IA");

  console.log(interpretation);

  await dispatchAction(phone, interpretation);

  await sendWhatsAppMessage(
    phone,
    interpretation.reply
  );
}