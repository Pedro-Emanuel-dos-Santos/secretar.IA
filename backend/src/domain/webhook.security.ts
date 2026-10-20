import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(body: Buffer, signature: unknown, appSecret: string): boolean {
  if (!appSecret || typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export function verifyChallenge(query: Record<string, unknown>, token: string | undefined): string | null {
  if (!token || query["hub.mode"] !== "subscribe" || typeof query["hub.verify_token"] !== "string" || typeof query["hub.challenge"] !== "string") return null;
  const actual = Buffer.from(query["hub.verify_token"]);
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? query["hub.challenge"] : null;
}
