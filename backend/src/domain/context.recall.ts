import type {PrismaClient} from "@prisma/client";
import type {AIInterpretation} from "../types/ai.types";
import {retrieveContext} from "./context.retrieval";
import {normalizeContext} from "./context.relevance";
import {contactTimezone} from "./preferences";

type Store=Parameters<typeof retrieveContext>[0] & Pick<PrismaClient,"contactPreference"|"user"|"incomingMessage">;
export function contextualRecallCommand(text:string):AIInterpretation|null{
 const s=normalizeContext(text);
 if(!/^(?:voce )?(?:lembra|recorda)(?: do| da| de| qual| o| a| em| sobre)|^(?:o que|quais informacoes) (?:voce )?(?:lembra|sabe|tem registrado)/.test(s))return null;
 if(/\b(?:apaga|apague|apagar|esqueca|esquece|esquecer|cancela|cancele|cancelar|marca|marque|marcar|agenda|agende|agendar|avisa|avise|avisar|lembrar|ligar|enviar|cria|crie|criar|salva|salve|salvar|guarde|guardar|registra|registre|registrar|muda|mude|mudar|altera|altere|alterar|atualiza|atualize|atualizar)\b/.test(s))return null;
 return {action:"recall_context",search:text,reply:"Vou consultar o que ficou registrado.",title:null,description:null,datetime:null,amount:null,category:null};
}
export async function executeContextRecall(store:Store,phone:string,phoneNumberId:string,query:string,now=new Date(),sourceMessageId?:string){
 const result=await retrieveContext(store,phone,phoneNumberId,query,now);
 if(!result.items.length)return "Não encontrei essa informação nos registros disponíveis. Pode me contar o assunto? Só uso memórias pessoais autorizadas; MINHAS MEMORIAS consulta os registros pessoais locais.";
 const timezone=await contactTimezone(store,phone,phoneNumberId);
 const only=result.items.length===1 && !result.ambiguous && !result.limited?result.items[0]:null;
 if(sourceMessageId && only && ["appointment","reminder"].includes(only.kind)){
  if(!await store.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId},select:{id:true}}))throw Error("Origem da consulta incompatível.");
  const user=await store.user.upsert({where:{phone},create:{phone},update:{}});
  await store.event.upsert({where:{id:`context_recall:${sourceMessageId}`},update:{},create:{id:`context_recall:${sourceMessageId}`,userId:user.id,type:"context_recall",source:"secretaria",payload:{phoneNumberId,sourceMessageId,target:{id:only.id,kind:only.kind,version:only.version}}}});
 }
 const display=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(value));
 const labels={personal:"memória autorizada",note:"anotação",appointment:"compromisso",reminder:"tarefa",fact:"informação de projeto/cliente",pending:"acompanhamento"};
 let reply=result.ambiguous?"Encontrei mais de um assunto parecido. Qual deles você quer retomar?":"Encontrei estes registros seus:";
 let shown=0;
 for(const item of result.items){
  const line=`\n• ${item.subject && item.kind!=="fact"?`${item.subject} — `:""}${item.title}: ${item.text}${item.startsAt?`\n  Horário registrado: ${display(item.startsAt)} (${timezone}).`:""}\n  Fonte: ${labels[item.kind]}, atualizada em ${display(item.updatedAt)}${item.sourceMessageId?", com origem na sua mensagem":"; sem referência de mensagem no registro antigo"}.`;
  if(reply.length+line.length>3500)break;reply+=line;shown++;
 }
 return reply+(result.limited || shown<result.items.length?"\nA busca é limitada; diga um nome ou assunto mais específico se faltar algo.":"");
}
