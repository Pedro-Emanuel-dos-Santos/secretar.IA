// Provider-reported counters only. An absent counter stays unknown, not zero.
export type UsageReport = {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  elapsedMs?: number;
  outcome: "completed" | "failed_or_unknown";
};

export type UsageObserver = (report: UsageReport) => void | Promise<void>;

const count = (value:unknown):number|undefined =>
  typeof value==="number" && Number.isSafeInteger(value) && value>=0 && value<=2147483647 ? value : undefined;

export function openAIUsage(response:{model?:unknown;status?:unknown;usage?:unknown},elapsedMs:number):UsageReport {
  const usage=response.usage && typeof response.usage==="object" ? response.usage as Record<string,unknown> : null;
  const details=usage?.input_tokens_details && typeof usage.input_tokens_details==="object" ? usage.input_tokens_details as Record<string,unknown> : null;
  const inputTokens=count(usage?.input_tokens),outputTokens=count(usage?.output_tokens);
  const cached=count(details?.cached_tokens);
  const cachedInputTokens=cached!==undefined && (inputTokens===undefined || cached<=inputTokens) ? cached : undefined;
  const model=typeof response.model==="string" && response.model.length>0 && response.model.length<=200 ? response.model : undefined;
  return {provider:"openai",...(model?{model}:{}),
    ...(inputTokens!==undefined?{inputTokens}:{}),...(outputTokens!==undefined?{outputTokens}:{}),
    ...(cachedInputTokens!==undefined?{cachedInputTokens}:{}),
    ...(count(elapsedMs)!==undefined?{elapsedMs}:{}),
    outcome:response.status==="completed"?"completed":"failed_or_unknown"};
}

// Observability must not turn a valid action into another paid retry. A failed
// write remains visible through the started/unknown ledger maintained by inbox.
export async function observeUsage(observer:UsageObserver|undefined,report:UsageReport) {
  if(!observer)return;
  try{await observer(report);}catch{console.error("Não foi possível confirmar a medição de uso da IA; consulte a operação.");}
}
