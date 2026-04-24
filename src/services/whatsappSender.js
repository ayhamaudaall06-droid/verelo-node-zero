const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

export async function sendMessage(to, messagePayload) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn('[WhatsAppSender] Missing credentials');
    return { ok: false };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace('+', ''),
    ...messagePayload
  };

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Unknown error');
    console.log(`[WhatsAppSender] Message sent to ${to}`);
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsAppSender] Failed:', err.message);
    return { ok: false, error: err.message };
  }
}
