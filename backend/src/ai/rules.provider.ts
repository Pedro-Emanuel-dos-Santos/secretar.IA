import { AIChatInput, AIChatOutput } from "./types";

const greetings = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"];
const thanks = ["obrigado", "obrigada", "valeu", "vlw", "thanks"];

export function tryRules(input: AIChatInput): AIChatOutput | null {
  const lastMessage = input.messages[input.messages.length - 1]?.content
    ?.trim()
    .toLowerCase();

  if (!lastMessage) return null;

  if (greetings.includes(lastMessage)) {
    return {
      provider: "rules",
      content: "Olá! 😊 Como posso te ajudar hoje?",
    };
  }

  if (thanks.includes(lastMessage)) {
    return {
      provider: "rules",
      content: "Disponha! 😊",
    };
  }

  return null;
}