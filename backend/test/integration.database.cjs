const databaseUrl = process.env.INBOX_TEST_DATABASE_URL;
if (!databaseUrl) throw Error("Configure INBOX_TEST_DATABASE_URL apontando para um banco isolado terminado em _test.");
const parsed = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) {
  throw Error("Teste de integração aceita somente banco local terminado em _test.");
}
module.exports = databaseUrl;
