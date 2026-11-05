// Servidor del webhook: Meta avisa aquí cada vez que un cliente escribe al WhatsApp del negocio.
import express from "express";
import { config } from "./config.js";
import { enviarTexto, marcarLeido, firmaValida } from "./whatsapp.js";
import { recibirMensaje } from "./entrada.js";

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.cuerpoCrudo = buf; } }));

const vistos = new Set(); // Meta a veces reenvía el mismo mensaje; se ignora la segunda vez

// Paso de verificación: Meta llama una vez a esta URL cuando configuras el webhook.
app.get("/webhook", (req, res) => {
  const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.whatsapp.verifyToken;
  if (ok) return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  if (!firmaValida(req.cuerpoCrudo, req.get("x-hub-signature-256"))) return res.sendStatus(401);
  res.sendStatus(200); // responder rápido; Meta reintenta si tardamos

  for (const entrada of req.body.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const valor = cambio.value ?? {};
      const nombres = Object.fromEntries((valor.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const msg of valor.messages ?? []) {
        if (vistos.has(msg.id)) continue;
        vistos.add(msg.id);
        if (vistos.size > 5000) vistos.delete(vistos.values().next().value);

        const texto = textoDeMensaje(msg);
        marcarLeido(msg.id);
        if (texto === null) {
          enviarTexto(msg.from, "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me lo escribes, por favor?").catch(console.error);
          continue;
        }
        recibirMensaje({ telefono: msg.from, nombre: nombres[msg.from], texto }, enviarTexto);
      }
    }
  }
});

function textoDeMensaje(msg) {
  switch (msg.type) {
    case "text":
      return msg.text.body;
    case "button":
      return msg.button.text;
    case "interactive":
      return msg.interactive.button_reply?.title ?? msg.interactive.list_reply?.title ?? null;
    case "location": {
      const l = msg.location;
      return `[Ubicación enviada] ${l.name ?? ""} ${l.address ?? ""} (https://maps.google.com/?q=${l.latitude},${l.longitude})`.trim();
    }
    case "image":
    case "video":
      return msg[msg.type].caption ? `[Envió una foto/video] ${msg[msg.type].caption}` : null;
    default:
      return null; // audios, stickers, documentos: por ahora no se procesan
  }
}

app.get("/", (_req, res) => res.send("Agente de WhatsApp funcionando ✅"));

app.listen(config.puerto, () => {
  console.log(`Agente escuchando en http://localhost:${config.puerto}  (webhook: /webhook)`);
  if (!config.whatsapp.token) console.warn("⚠️  Falta WHATSAPP_TOKEN en .env");
  if (!config.whatsapp.appSecret) console.warn("⚠️  Falta WHATSAPP_APP_SECRET: no se verifica que los mensajes vengan de Meta");
  console.log(`Dropi: modo ${config.dropi.modo}`);
});
