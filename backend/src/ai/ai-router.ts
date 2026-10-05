import { AIChatInput, AIChatOutput } from "./types";
import { openaiChat } from "./openai.provider";
import { ollamaChat } from "./ollama.provider";
import { tryRules } from "./rules.provider";

function shouldUseOpenAI(input: AIChatInput): boolean {
  const text = input.messages[input.messages.length - 1]?.content || "";

  if (text.length > 600) return true;

  const complexWords = [
    "analise",
    "resuma",
    "explique",
    "planeje",
    "estratégia",
    "contrato",
    "documento",
  ];

  return complexWords.some((word) => text.toLowerCase().includes(word));
}

export async function aiRouter(input: AIChatInput): Promise<AIChatOutput> {
  const ruleResponse = tryRules(input);
  if (ruleResponse) return ruleResponse;

  const mode = process.env.AI_MODE || "hybrid";

  if (mode === "openai") {
    return openaiChat(input);
  }

  if (mode === "ollama") {
    return ollamaChat(input);
  }

  if (shouldUseOpenAI(input)) {
    return openaiChat(input);
  }

  try {
    return await ollamaChat(input);
  } catch (error) {
    console.error("Ollama falhou. Usando OpenAI como fallback.", error);
    return openaiChat(input);
  }
}