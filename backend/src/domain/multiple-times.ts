// A single create action cannot represent several initial times. Ask for one
// task at a time instead of silently losing part of a multi-task request.
export function hasMultipleInitialTimes(text:string) {
  const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const times=normalized.match(/\bas\s+(?:\d{1,2}(?:h(?:\d{2})?|:\d{2})?|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte(?:\s+e\s+(?:uma|duas|tres))?)\b|\b\d{1,2}(?:h(?:\d{2})?|:\d{2})\b/g);
  return (times?.length || 0)>1;
}
