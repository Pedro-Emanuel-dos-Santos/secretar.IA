import type { PrismaClient, IncomingMessage } from "@prisma/client";

function cap(value:string | undefined, fallback:number, maximum:number) {
  const number=value ? Number(value) : fallback;
  if(!Number.isSafeInteger(number)||number<1||number>maximum)throw new Error("Limite de processamento inválido.");
  return number;
}
export async function requestBudget(store:Pick<PrismaClient,"incomingMessage">,row:IncomingMessage) {
  const scope={phone:row.phone,phoneNumberId:row.phoneNumberId,status:{not:"plan_step"},receivedAt:{gte:new Date(row.receivedAt.getTime()-24*3600000)},
    OR:[{receivedAt:{lt:row.receivedAt}},{receivedAt:row.receivedAt,id:{lt:row.id}}]};
  const requests=await store.incomingMessage.count({where:scope});
  if(requests>=cap(process.env.MAX_REQUESTS_PER_USER_PER_DAY,200,10000))return "Você chegou ao limite de pedidos em 24 horas. Ainda pode usar AJUDA, MEU DIA, PARAR e RETOMAR. Tente um novo pedido mais tarde.";
  if(row.mediaId){
    const audio=await store.incomingMessage.count({where:{...scope,mediaId:{not:null}}});
    if(audio>=cap(process.env.MAX_AUDIO_PER_USER_PER_DAY,20,500))return "Você chegou ao limite de áudios em 24 horas. Pode continuar por texto, respeitando o limite de pedidos.";
  }
  return null;
}
