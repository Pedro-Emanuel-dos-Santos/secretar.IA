import OpenAI from "openai";
import { AIChatInput, AIChatOutput } from "./types";
import { openAIUsage } from "../domain/ai.usage";

export async function openaiChat(input: AIChatInput, suppliedClient?: Pick<OpenAI,"responses">): Promise<AIChatOutput> {
  // Lazy initialization allows local-only mode to start without an OpenAI key.
  // Retries belong to the persisted inbox, not an invisible SDK loop.
  const client = suppliedClient ?? new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:28000,maxRetries:0});
  const started=performance.now();
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: input.temperature ?? 0.2,
    store:false,
    max_output_tokens:1600,
    ...(input.jsonMode ? {text:{format:{type:"json_object" as const}}} : {}),
  });

  return {
    provider: "openai",
    content: response.output_text || "",
    raw: response,
    usage: openAIUsage(response,Math.max(0,Math.round(performance.now()-started))),
  };
}
