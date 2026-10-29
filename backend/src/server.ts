import { Lifecycle } from "./runtime/lifecycle";

// Validate Railway's advertised shutdown budget BEFORE importing DB/queue/app.
const lifecycle = new Lifecycle("api");
lifecycle.run(async () => {
  const { prisma } = await import("./config/prisma.js");
  lifecycle.onClose(() => prisma.$disconnect());
  const { reminderQueue } = await import("./queue/reminder.queue.js");
  lifecycle.onClose(() => reminderQueue.close());
  const { app } = await import("./app.js");
  const { httpDrain } = await import("./runtime/http.drain.js");
  lifecycle.onDrain(() => { app.locals.shuttingDown = true; httpDrain.begin(); return httpDrain.work.waitForIdle(); });
  if (lifecycle.stopping) return;
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid_port");
  const server = app.listen(port, "0.0.0.0", () => console.log("API iniciada."));
  lifecycle.onDrain(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeIdleConnections();
  }));
  server.on("error", () => lifecycle.fail("http_server_failed"));
});
