import { AIChatInput, AIChatOutput } from "./types";

export async function ollamaChat(input: AIChatInput): Promise<AIChatOutput> {
  const started=performance.now();
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    signal:AbortSignal.timeout(12000),
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
  const counter=(n:unknown)=>typeof n==="number" && Number.isSafeInteger(n) && n>=0 && n<=2147483647;

  return {
    provider: "ollama",
    content: data.message?.content || "",
    raw: data,
    usage:{provider:"ollama",...(typeof data.model==="string" && data.model.length<=200?{model:data.model}:{}),...(counter(data.prompt_eval_count)?{inputTokens:data.prompt_eval_count}:{}),...(counter(data.eval_count)?{outputTokens:data.eval_count}:{}),elapsedMs:Math.round(performance.now()-started),outcome:data.done===false?"failed_or_unknown":"completed"},
  };
}
