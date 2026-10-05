import "dotenv/config";

import { secretaryPrompt } from "../prompts/secretary.prompt";
import { AIInterpretation } from "../types/ai.types";
import { aiRouter } from "../ai/ai-router";

export async function interpretMessage(
  context: any
): Promise<AIInterpretation> {

  const response = await aiRouter({
    task: "conversation",

    temperature: 0.2,

    jsonMode: true,

    messages: [
      {
        role: "system",
        content: secretaryPrompt,
      },

      {
        role: "user",
        content: JSON.stringify(context),
      },
    ],
  });

  return JSON.parse(response.content);
}