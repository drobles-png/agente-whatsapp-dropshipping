// Guardado simple en archivos JSON dentro de datos/. Suficiente para empezar;
// si el volumen crece, se cambia por una base de datos sin tocar el resto del código.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const carpetaConversaciones = path.join(config.carpetaDatos, "conversaciones");
const archivoPedidos = path.join(config.carpetaDatos, "pedidos.json");

fs.mkdirSync(carpetaConversaciones, { recursive: true });

function leerJson(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch {
    return porDefecto;
  }
}

function escribirJson(archivo, datos) {
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(datos, null, 2));
  fs.renameSync(temporal, archivo);
}

// --- Conversaciones ---------------------------------------------------------

function archivoConversacion(telefono) {
  return path.join(carpetaConversaciones, `${telefono.replace(/\D/g, "") || "simulador"}.json`);
}

export function cargarConversacion(telefono) {
  const conv = leerJson(archivoConversacion(telefono), null);
  if (!conv) return { telefono, mensajes: [], pausado: false, actualizado: null };

  // Tras muchas horas sin hablar, se empieza una conversación nueva.
  // El historial de pedidos no se pierde: el agente lo consulta con una herramienta.
  const horas = conv.actualizado ? (Date.now() - Date.parse(conv.actualizado)) / 36e5 : 0;
  if (horas > config.sesionHoras) conv.mensajes = [];
  return conv;
}

export function guardarConversacion(conv) {
  conv.actualizado = new Date().toISOString();
  escribirJson(archivoConversacion(conv.telefono), conv);
}

export function pausarConversacion(telefono, pausado) {
  const conv = cargarConversacion(telefono);
  conv.pausado = pausado;
  guardarConversacion(conv);
}

// --- Pedidos -----------------------------------------------------------------

export function listarPedidos() {
  return leerJson(archivoPedidos, []);
}

export function pedidosDeCliente(telefono) {
  return listarPedidos().filter((p) => p.telefono_whatsapp === telefono);
}

export function guardarPedido(pedido) {
  const pedidos = listarPedidos();
  const i = pedidos.findIndex((p) => p.id === pedido.id);
  if (i >= 0) pedidos[i] = pedido;
  else pedidos.push(pedido);
  escribirJson(archivoPedidos, pedidos);
  return pedido;
}

export function nuevoIdPedido() {
  const n = listarPedidos().length + 1;
  return `P${String(n).padStart(5, "0")}`;
}
