import OpenAI from "openai";
import { AIChatInput, AIChatOutput } from "./types";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function openaiChat(input: AIChatInput): Promise<AIChatOutput> {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: input.temperature ?? 0.2,
  });

  return {
    provider: "openai",
    content: response.output_text || "",
    raw: response,
  };
}