import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  raiz,
  carpetaDatos: path.join(raiz, "datos"),

  modelo: process.env.CLAUDE_MODELO || "claude-opus-5-5",
  esfuerzo: process.env.CLAUDE_ESFUERZO || "medium",

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    graphVersion: process.env.GRAPH_API_VERSION || "v23.0",
  },

  duenoWhatsapp: (process.env.DUENO_WHATSAPP || "").replace(/\D/g, ""),

  dropi: {
    modo: (process.env.DROPI_MODO || "manual").toLowerCase(),
    apiUrl: (process.env.DROPI_API_URL || "").replace(/\/$/, ""),
    token: process.env.DROPI_TOKEN || "",
  },

  puerto: Number(process.env.PORT) || 3000,
  sesionHoras: Number(process.env.SESION_HORAS) || 72,
};
