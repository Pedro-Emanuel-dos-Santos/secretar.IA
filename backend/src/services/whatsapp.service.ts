import "dotenv/config";

export async function sendWhatsAppMessage(phone: string, message: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiUrl = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v23.0";

  const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        body: message,
      },
    }),
  });

  const data = await response.json();

  console.log("Resposta da Meta:", data);

  if (!response.ok) {
    console.error("Erro ao enviar WhatsApp:", data);
    throw new Error("Erro ao enviar WhatsApp");
  }

  return data;
}