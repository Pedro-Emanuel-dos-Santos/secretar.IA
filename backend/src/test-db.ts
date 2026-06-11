import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: {
      phone: "5548999999999",
    },
    update: {},
    create: {
      name: "Pedro",
      phone: "5548999999999",
      timezone: "America/Sao_Paulo",
    },
  });

  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      title: "Pagar boleto",
      description: "Primeiro lembrete da Secretár.IA",
      remindAt: new Date("2026-06-11T11:30:00-03:00"),
    },
  });

  console.log("Usuário criado/encontrado:");
  console.log(user);

  console.log("Lembrete criado:");
  console.log(reminder);
}

main()
  .catch((error) => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });