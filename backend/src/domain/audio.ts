import { createHash } from "node:crypto";
export class AudioRejectedError extends Error {}
export function matchesMediaHash(bytes: Buffer, expected: string) {
  const digest = createHash("sha256").update(bytes).digest();
  return /^[a-fA-F0-9]{64}$/.test(expected)
    ? digest.toString("hex") === expected.toLowerCase()
    : digest.toString("base64") === expected;
}
export const audioFallback = "Não consegui entender esse áudio com segurança. Pode mandar o pedido por texto ou gravar um áudio curto e claro?";
export const maxAudioBytes = 5 * 1024 * 1024;
export const audioExtensions: Record<string,string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/webm": "webm",
};
export function audioMime(value: string) {
  const mime = value.split(";")[0].trim().toLowerCase();
  if (!audioExtensions[mime]) throw new AudioRejectedError("Formato de áudio não suportado.");
  return mime;
}
export function mediaDownloadUrl(value: unknown) {
  if (typeof value !== "string") throw new AudioRejectedError("Mídia indisponível.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "lookaside.fbsbx.com" || url.port || url.username || url.password) {
    throw new AudioRejectedError("Origem de mídia não permitida.");
  }
  return url.href;
}
export async function limitedAudio(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (length > maxAudioBytes || !response.body) { await response.body?.cancel(); throw new AudioRejectedError("Áudio grande demais."); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxAudioBytes) throw new AudioRejectedError("Áudio grande demais.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  if (!size) throw new AudioRejectedError("Áudio vazio.");
  return Buffer.concat(chunks);
}
