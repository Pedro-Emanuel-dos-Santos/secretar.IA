// A structured 4xx response is a known rejection, not a timeout after acceptance.
// Keep only numeric provider codes; error messages can contain private content.
export class WhatsAppSendRejected extends Error {
  constructor(public readonly httpStatus:number, public readonly code?:number,public readonly retryAfterMs?:number) {
    super("O WhatsApp recusou a mensagem.");
    this.name = "WhatsAppSendRejected";
  }
}
// Metadata verification failed BEFORE any message POST. Retrying cannot duplicate a send.
export class WhatsAppSendNotAttempted extends Error {
 constructor(){super("Verificação do template temporariamente indisponível.");}
}
export function retryableRejection(error:unknown){
 return error instanceof WhatsAppSendNotAttempted || error instanceof WhatsAppSendRejected &&
  (error.httpStatus===429 || error.code===130429 || error.code===131056);
}
export function templateRejection(error:unknown){
 return error instanceof WhatsAppSendRejected && [131047,132000,132001,132005,132007,132012,132015,132016].includes(error.code || 0);
}
export function providerRejection(status:number, body:unknown):WhatsAppSendRejected | null {
  if (status < 400 || status >= 500 || status === 408) return null;
  if (Array.isArray((body as {messages?:unknown} | null)?.messages)) return null;
  const error = (body as {error?:{code?:unknown}} | null)?.error;
  if (!error || typeof error !== "object") return null;
  return new WhatsAppSendRejected(status,Number.isSafeInteger(error.code) ? error.code as number : undefined);
}
