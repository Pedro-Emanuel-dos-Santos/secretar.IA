import "dotenv/config";
import { interpretMessage } from "./services/ai.service";

async function main() {
  const result = await interpretMessage(
    "me lembra amanhã às 10h de pagar o boleto"
  );

  console.log(result);
}

main();