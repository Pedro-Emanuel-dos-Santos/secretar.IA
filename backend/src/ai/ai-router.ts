import { AIChatInput, AIChatOutput } from "./types";
import { openaiChat } from "./openai.provider";
import { ollamaChat } from "./ollama.provider";
import { tryRules } from "./rules.provider";
import type {UsageReport,ProviderAttempt} from "../domain/ai.usage";
import {estimateAICost} from "../domain/ai.cost";

type Env=Record<string,string|undefined>;
type Provider=(input:AIChatInput)=>Promise<AIChatOutput>;
export class AIRoutingError extends Error{
 constructor(public readonly usage:UsageReport){super("Não foi possível concluir a interpretação de IA.");}
}
function currentRequest(input:AIChatInput):string|null{
 if(typeof input.currentMessage==="string")return input.currentMessage;
 const text=input.messages.at(-1)?.content || "";
 try{const parsed=JSON.parse(text);return typeof parsed?.currentMessage==="string"?parsed.currentMessage:null;}
 catch{return text.trim().startsWith("{")?null:text;}
}
export function chooseAIRoute(input:AIChatInput,env:Env=process.env):{provider:"openai"|"ollama";reason:string;fallback:boolean}{
 const mode=env.AI_MODE || "openai";
 if(!["openai","ollama","hybrid"].includes(mode))throw Error("AI_MODE inválido.");
 if(mode!=="hybrid")return {provider:mode as "openai"|"ollama",reason:mode==="openai"?"configured_primary_openai":"explicit_local_mode",fallback:false};
 if(!env.OLLAMA_BASE_URL)return {provider:"openai",reason:"local_endpoint_not_configured",fallback:false};
 const request=currentRequest(input)?.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(!request)return {provider:"openai",reason:"current_request_unavailable",fallback:false};
 if(input.task==="finance" || /\b(?:analise|analisa|resuma|resume|explique|explica|planeje|planeja|organiza|organize|estrategia|contrato|documento|sugestao|conselho)\b/.test(request))return {provider:"openai",reason:"current_request_reasoning",fallback:false};
 if(request.length>600)return {provider:"openai",reason:"current_request_long",fallback:false};
 return {provider:"ollama",reason:"current_request_simple",fallback:true};
}
export async function aiRouter(input:AIChatInput,deps:{env?:Env;openai?:Provider;ollama?:Provider}={}):Promise<AIChatOutput>{
 const rule=tryRules(input);if(rule)return rule;
 const env=deps.env || process.env,route=chooseAIRoute(input,env),started=performance.now();
 const attempts:ProviderAttempt[]=[];
 async function run(provider:"openai"|"ollama"){
  const began=performance.now(),requestedModel=(provider==="openai"?env.OPENAI_MODEL || "gpt-4.1-mini":env.OLLAMA_MODEL || "llama3.1:8b").slice(0,200);
  try{
   const result=await (provider==="openai"?deps.openai || openaiChat:deps.ollama || ollamaChat)(input),u=result.usage;
   attempts.push({provider,requestedModel,elapsedMs:Math.round(performance.now()-began),outcome:u?.outcome || "completed",...(u?.model?{model:u.model}:{}),...(u?.inputTokens!==undefined?{inputTokens:u.inputTokens}:{}),...(u?.outputTokens!==undefined?{outputTokens:u.outputTokens}:{}),...(u?.cachedInputTokens!==undefined?{cachedInputTokens:u.cachedInputTokens}:{})});
   return result;
  }catch{
   attempts.push({provider,requestedModel,elapsedMs:Math.round(performance.now()-began),outcome:"failed_or_unknown"});return null;
  }
 }
 let result=await run(route.provider);
 if(!result && route.fallback)result=await run("openai");
 const usage:UsageReport={...(result?.usage || {provider:result?.provider || attempts.at(-1)?.provider || "unknown",outcome:result?"completed":"failed_or_unknown"}),elapsedMs:Math.round(performance.now()-started),routingReason:route.reason,fallbackUsed:attempts.length>1,providerAttempts:attempts};
 Object.assign(usage,estimateAICost(usage));
 if(!result)throw new AIRoutingError(usage);
 return {...result,usage};
}
