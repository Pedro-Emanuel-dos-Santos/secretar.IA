import { prisma } from "../config/prisma";
import { reminderQueue } from "../queue/reminder.queue";

export async function createReminder(data: {
  phone: string;
  title: string;
  description?: string;
  remindAt: string;
}) {
  const { phone, title, description, remindAt } = data;

  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      name: null,
      timezone: "America/Sao_Paulo",
    },
  });

  const reminderDate = new Date(remindAt);
  const delay = reminderDate.getTime() - Date.now();

  if (delay <= 0) {
    throw new Error("A data do lembrete precisa ser no futuro.");
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      title,
      description,
      remindAt: reminderDate,
    },
  });

  await reminderQueue.add(
    "send-reminder",
    {
      reminderId: reminder.id,
      phone,
      message: `⏰ Lembrete: ${title}`,
    },
    { delay }
  );

  return reminder;
}