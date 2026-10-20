import type { RedisOptions } from "ioredis";

export function redisOptions(env: NodeJS.ProcessEnv): RedisOptions {
  const result: RedisOptions = { host: env.REDIS_HOST || "localhost", port: Number(env.REDIS_PORT || 6379), maxRetriesPerRequest: null };
  if (env.REDIS_URL) {
    let url: URL;
    try { url = new URL(env.REDIS_URL); } catch { throw new Error("REDIS_URL inválida."); }
    if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error("REDIS_URL deve usar redis:// ou rediss://.");
    Object.assign(result, { host: url.hostname, port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number(url.pathname.slice(1) || 0), ...(url.protocol === "rediss:" ? { tls: {} } : {}) });
  }
  if (!Number.isInteger(result.port) || result.port! < 1 || result.port! > 65535 ||
    (result.db !== undefined && (!Number.isInteger(result.db) || result.db < 0))) throw new Error("Porta ou banco Redis inválido.");
  return result;
}

export const redisConnection = redisOptions(process.env);
