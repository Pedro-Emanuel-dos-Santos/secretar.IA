// src/test-ai-router.ts

import "dotenv/config";
import { aiRouter } from "./ai/ai-router";

async function main() {
  const response = await aiRouter({
    task: "conversation",
    messages: [
      {
        role: "user",
        content: "oi",
      },
    ],
  });

  console.log(response);
}

main();