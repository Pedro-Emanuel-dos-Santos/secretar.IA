import type { Request, Response } from "express";
import { ReminderInput, validateReminder } from "../domain/reminder.validation";
import { ReminderQuotaError, RemindersPausedError } from "../domain/reminder.limits";

export function createReminderHandler(create:(input:ReminderInput)=>Promise<{status:string}>) {
  return async (req:Request,res:Response)=>{
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({error:"Informe phone, title e remindAt."});
    const {phone,title,description,remindAt}=req.body;
    const input={phone,title,description,remindAt};
    try { validateReminder(input); } catch(error) {
      return res.status(400).json({error:error instanceof Error ? error.message : "Dados inválidos."});
    }
    try {
      const reminder=await create(input);
      const waiting=["scheduling_pending","scheduling_failed"].includes(reminder.status);
      return res.status(waiting ? 202 : 201).json({
        message:waiting ? "Lembrete registrado. O agendamento ainda não foi confirmado." : "Lembrete criado e agendado com sucesso.",reminder,
      });
    }catch(error){
      if (error instanceof ReminderQuotaError) return res.status(429).json({error:error.reply});
      if (error instanceof RemindersPausedError) return res.status(409).json({error:error.reply});
      return res.status(503).json({error:"Não foi possível registrar o lembrete agora. Tente novamente mais tarde."});
    }
  };
}
