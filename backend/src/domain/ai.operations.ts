import type {PrismaClient} from "@prisma/client";

export async function aiOperationalOverview(store:Pick<PrismaClient,"aiUsage">,phoneNumberId:string,now=new Date()){
 const groups=await store.aiUsage.groupBy({by:["provider","model","routingReason","costStatus","fallbackUsed","outcome"],where:{message:{phoneNumberId},createdAt:{gte:new Date(now.getTime()-86400000),lte:now}},_count:{_all:true},_sum:{inputTokens:true,outputTokens:true,estimatedCostUsd:true},_avg:{elapsedMs:true}});
 return {windowHours:24,currency:"USD",scope:"openai_standard_text_tokens",groups:groups.map(r=>({provider:r.provider,model:r.model,routingReason:r.routingReason,fallbackUsed:r.fallbackUsed,costStatus:r.costStatus,outcome:r.outcome,requests:r._count._all,inputTokens:r._sum.inputTokens,outputTokens:r._sum.outputTokens,estimatedCostUsd:r._sum.estimatedCostUsd,meanLatencyMs:r._avg.elapsedMs})),note:"Somas incluem somente contagens conhecidas; nulo é desconhecido. Estimativa exclui infraestrutura, ferramentas, câmbio e impostos."};
}
