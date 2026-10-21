import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { taskSubject, TaskSubjectError } from "./task.subject";

export async function relinkTask(tx:Prisma.TransactionClient,phone:string,phoneNumberId:string,id:string,intent:AIInterpretation){
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 await tx.$queryRaw`SELECT id FROM "Reminder" WHERE id=${id} FOR UPDATE`;
 const task=await tx.reminder.findFirst({where:{id,userId:user.id,kind:"task",OR:[{sourceMessage:{phoneNumberId}},{scheduleOutbox:{phoneNumberId}}]}});
 if(!task || task.state!=="active")return "Não encontrei essa tarefa entre as suas pendentes.";
 if(task.appointmentId)return "Esse aviso pertence a um compromisso. O vínculo dele é definido pelo próprio compromisso.";
 if(["sending","delivery_unknown"].includes(task.status))return "O aviso está em envio ou sem resultado confirmado. Aguarde antes de mudar o cliente da tarefa.";
 if((intent.expectedVersion!==undefined && task.scheduleVersion!==intent.expectedVersion) || (intent.expectedSubjectId!==undefined && task.subjectId!==intent.expectedSubjectId))return "Essa tarefa mudou desde a consulta. Confira o vínculo atual antes de alterá-lo.";
 if(intent.clearSubject && intent.subject)return "Você quer remover o vínculo ou escolher outro cliente?";
 if(!intent.clearSubject && !intent.subject?.trim())return "Qual é o nome completo do cliente ou projeto dessa tarefa?";
 let subject;
 try{subject=intent.clearSubject?null:await taskSubject(tx,user.id,phoneNumberId,intent.subject!,intent.subjectKind);}
 catch(error){if(error instanceof TaskSubjectError)return error.reply;throw error;}
 const subjectId=subject?.id || null;
 if(subjectId===task.subjectId)return subject?`Essa tarefa já está vinculada a ${subject.name}.`:"Essa tarefa já está sem cliente ou projeto vinculado.";
 // This is metadata only. Changing scheduleVersion would invalidate the
 // existing job and require republishing an otherwise unchanged notification.
 const changed=await tx.reminder.updateMany({where:{id:task.id,userId:user.id,state:"active",subjectId:task.subjectId,scheduleVersion:task.scheduleVersion,status:task.status},data:{subjectId}});
 if(!changed.count)throw Error("Vínculo mudou durante a atualização.");
 await tx.event.create({data:{userId:user.id,type:"task_subject_changed",source:"secretaria",payload:{phoneNumberId,reminderId:task.id,previousSubjectId:task.subjectId,subjectId,scheduleVersion:task.scheduleVersion}}});
 return (subject?`Vinculei a tarefa ${task.title} a ${subject.name}.`:`Retirei o vínculo de cliente/projeto da tarefa ${task.title}.`)+" Mantive o horário e o estado do aviso, sem agendar outro envio.";
}
