import type { UsageReport } from "./ai.usage";

// Standard text pricing, USD / 1M tokens. No tools, hosting, taxes or FX.
// Verified 2026-10-28: https://developers.openai.com/api/docs/models/gpt-4.1-mini
export const pricingVersion="openai-standard-text-2026-10-28";
export function estimateAICost(usage:UsageReport):Partial<UsageReport>{
 if(usage.provider!=="openai" || !["gpt-4.1-mini","gpt-4.1-mini-2025-04-14"].includes(usage.model || ""))return {costStatus:"unknown_model"};
 const {inputTokens:i,outputTokens:o}=usage,c=usage.cachedInputTokens ?? (i===0?0:undefined);
 if(i===undefined || o===undefined || c===undefined || [i,o,c].some(n=>!Number.isSafeInteger(n) || n<0) || c>i)return {costStatus:"unknown_usage",pricingVersion};
 return {estimatedCostUsd:Number((((i-c)*0.4+c*0.1+o*1.6)/1e6).toFixed(12)),pricingVersion,costStatus:"estimated"};
}
