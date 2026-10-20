async function main() {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) throw Error("Configure ADMIN_API_TOKEN no .env.");
  const response = await fetch("http://127.0.0.1:3000/operations", {
    headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error("Consulta operacional retornou HTTP " + response.status + ".");
  console.log(JSON.stringify(await response.json(), null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
