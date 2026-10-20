import { app } from "./app";
import { prisma } from "./config/prisma";
import { reminderQueue } from "./queue/reminder.queue";

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT inválida.");
const server=app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Secretár.IA API rodando na porta ${port}`);
});

let stopping=false;
async function stop() {
  if(stopping)return;stopping=true;app.locals.shuttingDown=true;
  const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();
  try {
    await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
    await reminderQueue.close();await prisma.$disconnect();clearTimeout(deadline);process.exit(0);
  }catch{console.error("API encerrada com pendências preservadas.");process.exit(1);}
}
process.on("SIGTERM",()=>void stop());
process.on("SIGINT",()=>void stop());
