async function main() {
  const response = await fetch("http://localhost:3000/reminders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: "5548991164619",
      title: "Testar API da Secretár.IA",
      description: "Primeiro lembrete via API",
      remindAt: "2026-07-02T16:34:00-03:00",
    }),
  });

  const data = await response.json();

  console.log(data);
}

main();