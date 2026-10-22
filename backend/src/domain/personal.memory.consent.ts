import type { Prisma,PrismaClient } from "@prisma/client";
type Store=Pick<PrismaClient,"event">;
const version=1;
export async function personalMemoryConsent(store:Store,phone:string,phoneNumberId:string){
 return (await personalMemoryPolicy(store,phone,phoneNumberId)).enabled;
}
export async function personalMemoryPolicy(store:Store,phone:string,phoneNumberId:string){
 const row=await store.event.findFirst({where:{type:"personal_memory_consent",user:{phone},payload:{path:["phoneNumberId"],equals:phoneNumberId}},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 const p=row?.payload as Record<string,unknown>|undefined;
 const enabled=process.env.AI_MODE==="openai" && p?.enabled===true && p?.provider==="openai" && p?.version===version;
 return {enabled,hideHistoryBefore:!enabled && p?.enabled===false?row!.createdAt:null,omitHistory:!enabled && !!row && p?.enabled!==false};
}
export async function memoryDisclosure(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,sourceId?:string){
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 await tx.event.create({data:{userId:user.id,type:"personal_memory_disclosure",source:"secretaria",payload:{phoneNumberId,sourceMessageId:sourceId || null,provider:"openai",version}}});
 return "Posso guardar informações que você pedir sobre rotina, preferências, pessoas e objetivos para personalizar nossas conversas. Essas memórias serão armazenadas pela Secretár.IA e enviadas à OpenAI junto do contexto; podem conter dados sensíveis, inclusive de saúde, se você os informar. Não vou aprender hábitos silenciosamente nem criar avisos por conta própria. Para autorizar, envie ACEITO MEMORIA depois de receber esta explicação. DESATIVAR MEMORIA interrompe o uso e o envio futuro dessas memórias; dados já processados pelo provedor não são apagados por isso. MINHAS MEMORIAS consulta os registros e APAGAR MEUS DADOS inicia a limpeza completa local.";
}
export async function setPersonalMemoryConsent(phone:string,phoneNumberId:string,enabled:boolean,tx:Prisma.TransactionClient,sourceId?:string){
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 if(enabled){
  if(process.env.AI_MODE!=="openai")return "A memória personalizada está disponível somente com o provedor OpenAI configurado nesta versão. Não ativei o compartilhamento.";
  const disclosure=await tx.event.findFirst({where:{type:"personal_memory_disclosure",userId:user.id,createdAt:{gte:new Date(Date.now()-86400000)},AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{payload:{path:["version"],equals:version}}]},orderBy:[{createdAt:"desc"},{id:"desc"}]});
  const payload=disclosure?.payload as Record<string,unknown>|undefined;
  const delivered=typeof payload?.sourceMessageId==="string" && await tx.incomingMessage.findFirst({where:{id:payload.sourceMessageId,phone,phoneNumberId,reply:{status:"provider_accepted"}},select:{id:true}});
  if(!delivered)return memoryDisclosure(phone,phoneNumberId,tx,sourceId);
 }
 await tx.event.deleteMany({where:{userId:user.id,type:"personal_memory_consent",payload:{path:["phoneNumberId"],equals:phoneNumberId}}});
 await tx.event.create({data:{userId:user.id,type:"personal_memory_consent",source:"secretaria",payload:{phoneNumberId,provider:"openai",version,enabled,sourceMessageId:sourceId || null}}});
 return enabled?"Memória pessoal ativada com sua autorização para uso nas respostas da OpenAI. Diga o que quer que eu guarde; você pode consultar, corrigir ou desativar quando quiser.":"Desativei a memória pessoal. Não vou incluir esses registros em novos contextos da OpenAI. As memórias ficam guardadas para consulta ou exclusão; uma solicitação já iniciada pode terminar.";
}
