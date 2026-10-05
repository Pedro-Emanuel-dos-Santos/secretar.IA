import { reminderQueue } from "./queue";

async function main() {
  await reminderQueue.add(
    "send-reminder",
    {
      phone: "5548991164619",
      message: "⏰ Lembrete: pagar boleto!",
    },
    {
      delay: 10000, // 10 segundos
    }
  );

  console.log("✅ Lembrete agendado para daqui 10 segundos.");
}

main();