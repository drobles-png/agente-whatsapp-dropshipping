// Cliente mínimo de la WhatsApp Cloud API (Meta).
import crypto from "node:crypto";
import { config } from "./config.js";

const { token, phoneNumberId, graphVersion, appSecret } = config.whatsapp;

async function llamarGraph(cuerpo) {
  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// WhatsApp corta los mensajes de más de 4096 caracteres.
export async function enviarTexto(telefono, texto) {
  for (let i = 0; i < texto.length; i += 4000) {
    await llamarGraph({
      to: telefono,
      type: "text",
      text: { body: texto.slice(i, i + 4000), preview_url: false },
    });
  }
}

// Marca el mensaje como leído (los dos checks azules) y muestra "escribiendo...".
export async function marcarLeido(idMensaje) {
  try {
    await llamarGraph({
      status: "read",
      message_id: idMensaje,
      typing_indicator: { type: "text" },
    });
  } catch (err) {
    console.warn("No se pudo marcar como leído:", err.message);
  }
}

// Comprueba que la petición al webhook la firmó Meta con la clave secreta de la app.
export function firmaValida(cuerpoCrudo, firma) {
  if (!appSecret) return true; // sin clave configurada no se puede verificar (solo para pruebas)
  if (!firma?.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", appSecret).update(cuerpoCrudo).digest("hex");
  const a = Buffer.from(firma.slice(7), "hex");
  const b = Buffer.from(esperada, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
