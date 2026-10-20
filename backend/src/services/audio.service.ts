import OpenAI, { toFile } from "openai";
import { createHash } from "node:crypto";
import { AudioRejectedError, audioMime, audioExtensions, limitedAudio, maxAudioBytes, mediaDownloadUrl } from "../domain/audio";

export async function transcribeWhatsAppAudio(message: {mediaId: string; mediaMimeType: string | null; phoneNumberId: string; phone: string}) {
  if (process.env.WHATSAPP_AUDIO_ENABLED !== "true") throw new AudioRejectedError("Áudio ainda não habilitado.");
  const allowed = (process.env.WHATSAPP_AUDIO_ALLOWED_PHONES || "").split(",").map(value=>value.trim()).filter(Boolean);
  if (!allowed.includes(message.phone)) throw new AudioRejectedError("Áudio não habilitado para essa pessoa.");
  const token = process.env.WHATSAPP_ACCESS_TOKEN, key = process.env.OPENAI_API_KEY;
  if (!token || !key || message.phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID || !/^\d{1,128}$/.test(message.mediaId)) throw new AudioRejectedError("Áudio indisponível.");
  const expectedMime = audioMime(message.mediaMimeType || "");
  const headers = {Authorization: `Bearer ${token}`};
  // Credentials only go to fixed Meta origins; never use a URL from the webhook.
  const metadata = await fetch(`https://graph.facebook.com/v23.0/${message.mediaId}?phone_number_id=${encodeURIComponent(message.phoneNumberId)}`,
    {headers, redirect:"error", signal:AbortSignal.timeout(12000)});
  if (!metadata.ok) {
    if ([400,403,404,410].includes(metadata.status)) throw new AudioRejectedError("Mídia indisponível.");
    throw new Error("Falha temporária ao consultar áudio.");
  }
  const media = await metadata.json() as {url?:string; mime_type?:string; file_size?:number; sha256?:string};
  if (media.file_size && media.file_size > maxAudioBytes) throw new AudioRejectedError("Áudio grande demais.");
  const mime = audioMime(media.mime_type || "");
  if (mime !== expectedMime) throw new AudioRejectedError("Formato de mídia incompatível.");
  const response = await fetch(mediaDownloadUrl(media.url), {headers,redirect:"error",signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error("Falha temporária ao baixar áudio.");
  const bytes = await limitedAudio(response);
  if (media.sha256 && createHash("sha256").update(bytes).digest("base64") !== media.sha256) throw new AudioRejectedError("Conteúdo incompatível.");
  const client = new OpenAI({apiKey:key,timeout:20000,maxRetries:0});
  try {
    const result = await client.audio.transcriptions.create({
      model:process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
      file:await toFile(bytes,`voice.${audioExtensions[mime]}`,{type:mime}),language:"pt",response_format:"json",
    });
    const text = result.text?.trim();
    if (!text || text.length > 16000) throw new AudioRejectedError("Transcrição vazia ou longa demais.");
    return text;
  } catch (error) {
    if (error instanceof OpenAI.APIError && [400,413,415,422].includes(error.status || 0)) throw new AudioRejectedError("Não foi possível transcrever o áudio.");
    throw error;
  } finally { bytes.fill(0); }
}
