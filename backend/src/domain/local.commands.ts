import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { dayOverview } from "./day.overview";
import { presentAudioDisclosure,setAudioConsent,executePreferences } from "./preferences";
import { requestContentDeletion,confirmContentDeletion } from "./privacy";

export type LocalCommand = "help" | "privacy" | "pause" | "resume" | "today" | "audio_info" | "audio_accept" | "audio_revoke" | "profile" | "usage" | "erase_request" | "erase_confirm";
export function localCommand(text: string): LocalCommand | null {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[.!?]+$/, "").trim();
  if(value==="audio" || value==="como funciona o audio")return "audio_info";
  if(value==="aceito audio")return "audio_accept";
  if(value==="desativar audio")return "audio_revoke";
  if(value==="meu perfil")return "profile";
  if(value==="meu consumo")return "usage";
  if(value==="apagar meus dados")return "erase_request";
  if(/^confirmar exclusao [a-f0-9]{8}$/.test(value))return "erase_confirm";
  if (["ajuda", "menu", "comecar", "como funciona"].includes(value)) return "help";
  if (["privacidade", "meus dados"].includes(value)) return "privacy";
  if (["parar", "stop", "pausar lembretes", "nao quero receber lembretes"].includes(value)) return "pause";
  if (/^(?:por favor,?\s+)?(?:(?:quero|gostaria de)\s+)?(?:parar|pare|pausar|pause|pausa|suspender|suspenda)(?:\s+(?:os|meus))?\s+(?:avisos|lembretes)(?:,?\s+por favor)?$/.test(value)) return "pause";
  if (["retomar", "ativar lembretes", "retomar lembretes"].includes(value)) return "resume";
  if (["meu dia", "resumo de hoje"].includes(value)) return "today";
  return null;
}
export function localCommandIntent(text: string): AIInterpretation | null {
  return localCommand(text) ? {action:"conversation",title:null,description:null,datetime:null,amount:null,category:null,reply:"Vou conferir seu pedido."} : null;
}
export async function executeLocalCommand(command: LocalCommand, phone: string, phoneNumberId: string, tx: Prisma.TransactionClient,current?:{id:string;text:string}) {
  if(command==="erase_request")return requestContentDeletion(phone,phoneNumberId,tx);
  if(command==="erase_confirm")return current?confirmContentDeletion(phone,phoneNumberId,tx,current):"Envie APAGAR MEUS DADOS para receber as instruções de confirmação.";
  if(command==="audio_info")return presentAudioDisclosure(phone,phoneNumberId,tx);
  if(command==="audio_accept" || command==="audio_revoke")return setAudioConsent(phone,phoneNumberId,command==="audio_accept",tx);
  if(command==="profile" || command==="usage")return executePreferences(phone,phoneNumberId,{action:command==="profile"?"show_preferences":"usage_summary",title:null,description:null,datetime:null,category:null,amount:null,reply:"interno"},tx);
  if (command === "today") return dayOverview(phone,phoneNumberId,tx);
  if (command === "help") return "Sou a Secretár.IA. Posso ajudar com suas tarefas e prazos. Exemplos:\n" +
    "• Me lembra amanhã às 9h de enviar o orçamento.\n• Quais são meus lembretes de hoje?\n• Adia o lembrete do orçamento para amanhã às 10h.\n" +
    "Pode conversar naturalmente e continuar um pedido com o horário ou uma correção. Marco compromissos com até três avisos: ‘Reunião amanhã às 10h, me avisa meia hora antes e na hora’. Guardo dados de clientes e projetos: ‘Orçamento do cliente João Silva é R$ 500’. Depois, você pode atualizar o valor ou consultar o histórico. Também guardo anotações gerais.\nPreparo séries de 2 a 12 lembretes diários, semanais ou mensais. Uso o horário de Brasília.\n" +
    "Depois de um aviso, pode dizer ‘já fiz’ ou ‘estou aguardando João’. Para acompanhar sem novo aviso, pergunte ‘o que está aguardando?’. Também pode consultar tarefas concluídas ou atrasadas. Para remover um dado específico do cadastro, diga ‘apaga o orçamento do cliente João Silva’; isso não apaga mensagens e notas gerais.\n"+
    "Envie MEU DIA para ver as tarefas de hoje, PARAR para pausar os avisos, RETOMAR para voltar ou PRIVACIDADE para saber sobre seus dados.";
  if (command === "privacy") return "Guardo suas mensagens, transcrições, lembretes, compromissos, anotações, dados de clientes/projetos com histórico de alterações e estados de entrega para executar seus pedidos. O WhatsApp é processado pela Meta, e o texto pode ser enviado ao provedor de IA configurado. " +
    (process.env.AUDIO_TRANSCRIPTION_PROVIDER === "openai" ? "Quando habilitado, o áudio é enviado à OpenAI para transcrição. " : "Quando habilitado, o áudio é transcrito no computador/servidor da Secretár.IA. ") +
    "A aplicação não salva o arquivo de voz no disco. O piloto ainda não tem exclusão automática nem prazo de descarte configurado; fale com o responsável para solicitar acesso ou exclusão dos seus dados. Envie PARAR para pausar os avisos.";
  const now = new Date();
  // Upsert locks this contact row until the command and missed-avisos updates
  // commit together. Repeated PARAR must not reset the start of the pause.
  const previous = await tx.contactPreference.upsert({
    where:{phoneNumberId_phone:{phoneNumberId,phone}},
    create:{phoneNumberId,phone,remindersPaused:false},
    update:{updatedAt:now},
  });
  if (command === "resume" && previous.remindersPaused && previous.pausedAt) {
    await tx.reminder.updateMany({where:{user:{phone},scheduleOutbox:{phoneNumberId},state:"active",
      remindAt:{gte:previous.pausedAt,lte:now},status:{in:["pending","scheduled","scheduling_pending","scheduling_failed","blocked_paused"]}},
      data:{status:"blocked_paused"}});
    await tx.scheduleOutbox.updateMany({where:{phoneNumberId,reminder:{user:{phone},status:"blocked_paused"}},
      data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
  }
  await tx.contactPreference.update({
    where:{phoneNumberId_phone:{phoneNumberId,phone}},
    data:{remindersPaused:command === "pause",pausedAt:command === "pause" ? previous.remindersPaused ? previous.pausedAt : now : null},
  });
  return command === "pause"
    ? "Pausei seus avisos. Seus lembretes continuam guardados. Avisos cujo envio já começou ainda podem chegar. Envie RETOMAR quando quiser voltar."
    : "Retomei seus avisos futuros. Avisos que venceram durante a pausa não serão reenviados automaticamente. Pode consultar seus lembretes ou reagendar um aviso.";
}
