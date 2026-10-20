import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const reminderQueue = new Queue("reminders", {
  connection: { ...redisConnection, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
});

reminderQueue.on("error", () => {
  console.error("Fila de lembretes indisponível; pendências preservadas no banco.");
});
