import { AIChatInput, AIChatOutput } from "./types";

export async function ollamaChat(input: AIChatInput): Promise<AIChatOutput> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.1:8b",
      messages: input.messages,
      stream: false,
      format: input.jsonMode ? "json" : undefined,
      options: {
        temperature: input.temperature ?? 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    provider: "ollama",
    content: data.message?.content || "",
    raw: data,
  };
}