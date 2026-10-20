import { app } from "./app";

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT inválida.");
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Secretár.IA API rodando na porta ${port}`);
});
