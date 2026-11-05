// Avisos al dueño: pedidos nuevos, novedades y chats que necesitan a una persona.
// Siempre quedan en datos/notificaciones.log; además se envían a tu WhatsApp si está configurado.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { enviarTexto } from "./whatsapp.js";

const archivoLog = path.join(config.carpetaDatos, "notificaciones.log");

// En el simulador de terminal se reemplaza para imprimir en pantalla en vez de enviar.
let enviar = async (texto) => {
  if (!config.duenoWhatsapp || !config.whatsapp.token) return;
  await enviarTexto(config.duenoWhatsapp, texto);
};

export function usarCanalAvisos(funcion) {
  enviar = funcion;
}

export async function avisarDueno(texto) {
  fs.appendFileSync(archivoLog, `[${new Date().toISOString()}]\n${texto}\n\n`);
  try {
    await enviar(texto);
  } catch (err) {
    // Meta solo deja escribirte si le escribiste al número del negocio en las últimas 24 h.
    console.warn("No se pudo avisar al dueño por WhatsApp (queda en notificaciones.log):", err.message);
  }
}
