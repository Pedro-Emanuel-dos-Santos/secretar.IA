// A structured 4xx response is a known rejection, not a timeout after acceptance.
// Keep only numeric provider codes; error messages can contain private content.
export class WhatsAppSendRejected extends Error {
  constructor(public readonly httpStatus:number, public readonly code?:number) {
    super("O WhatsApp recusou a mensagem.");
    this.name = "WhatsAppSendRejected";
  }
}
export function providerRejection(status:number, body:unknown):WhatsAppSendRejected | null {
  if (status < 400 || status >= 500 || status === 408) return null;
  if (Array.isArray((body as {messages?:unknown} | null)?.messages)) return null;
  const error = (body as {error?:{code?:unknown}} | null)?.error;
  if (!error || typeof error !== "object") return null;
  return new WhatsAppSendRejected(status,Number.isSafeInteger(error.code) ? error.code as number : undefined);
}
