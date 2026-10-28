import "dotenv/config";

import { secretaryPrompt } from "../prompts/secretary.prompt";
import { AIInterpretation } from "../types/ai.types";
import { aiRouter,AIRoutingError } from "../ai/ai-router";
import { parseInterpretation } from "../domain/interpretation.validation";
import { observeUsage, UsageObserver } from "../domain/ai.usage";

export async function interpretMessage(
  context: any,
  onUsage?: UsageObserver,
  router:typeof aiRouter=aiRouter
): Promise<AIInterpretation> {

  const started=performance.now();
  let response:Awaited<ReturnType<typeof aiRouter>>;
  try{response = await router({
    task: "conversation",
    currentMessage:typeof context?.currentMessage==="string"?context.currentMessage:undefined,

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
  });}catch(error){
    const mode=process.env.AI_MODE;
    await observeUsage(onUsage,error instanceof AIRoutingError?error.usage:{provider:mode==="openai"||mode==="ollama"?mode:"unknown",elapsedMs:Math.max(0,Math.round(performance.now()-started)),outcome:"failed_or_unknown"});
    throw error;
  }

  // Persist real usage before parsing: malformed model JSON still consumed
  // tokens. Never infer missing token counts from text length or estimates.
  await observeUsage(onUsage,response.usage || {provider:response.provider,elapsedMs:Math.max(0,Math.round(performance.now()-started)),outcome:"completed"});

  return parseInterpretation(response.content);
}
