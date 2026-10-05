import { Request, Response } from "express";
import { createReminder } from "../services/reminder.service";

export async function createReminderController(req: Request, res: Response) {
  try {
    const { phone, title, description, remindAt } = req.body;

    if (!phone || !title || !remindAt) {
      return res.status(400).json({
        error: "phone, title e remindAt são obrigatórios",
      });
    }

    const reminder = await createReminder({
      phone,
      title,
      description,
      remindAt,
    });

    return res.status(201).json({
      message: "Lembrete criado e agendado com sucesso.",
      reminder,
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || "Erro ao criar lembrete.",
    });
  }
}