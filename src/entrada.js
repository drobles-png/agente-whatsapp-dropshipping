// Ordena los mensajes que llegan: junta los que un cliente manda seguidos, procesa un turno
// a la vez por cliente y atiende los comandos del dueño.
import { config } from "./config.js";
import { responder } from "./agente.js";
import { pausarConversacion } from "./almacen.js";
import { actualizarEstadoPedido } from "./herramientas.js";

const ESPERA_MS = 4000; // la gente manda "hola" / "precio?" / "de la lámpara" en mensajes separados

const pendientes = new Map(); // telefono -> { textos, nombre, temporizador }
const colas = new Map(); // telefono -> promesa del turno en curso

/**
 * @param {object} m { telefono, nombre, texto }
 * @param {(telefono: string, texto: string) => Promise<void>} enviar
 */
export function recibirMensaje(m, enviar) {
  if (config.duenoWhatsapp && m.telefono === config.duenoWhatsapp && m.texto.startsWith("/")) {
    return enviar(m.telefono, comandoDueno(m.texto));
  }

  const p = pendientes.get(m.telefono) ?? { textos: [] };
  p.textos.push(m.texto);
  p.nombre = m.nombre;
  clearTimeout(p.temporizador);
  p.temporizador = setTimeout(() => {
    pendientes.delete(m.telefono);
    encolar(m.telefono, () => procesar(m.telefono, p.nombre, p.textos.join("\n"), enviar));
  }, ESPERA_MS);
  pendientes.set(m.telefono, p);
}

function encolar(telefono, tarea) {
  const anterior = colas.get(telefono) ?? Promise.resolve();
  const siguiente = anterior.then(tarea, tarea);
  colas.set(telefono, siguiente);
  siguiente.finally(() => colas.get(telefono) === siguiente && colas.delete(telefono));
}

async function procesar(telefono, nombre, texto, enviar) {
  console.log(`📩 ${nombre} (+${telefono}): ${texto}`);
  try {
    const respuesta = await responder({ telefono, nombre, texto });
    if (respuesta) {
      console.log(`🤖 → +${telefono}: ${respuesta}\n`);
      await enviar(telefono, respuesta);
    }
  } catch (err) {
    console.error(`Error atendiendo a +${telefono}:`, err);
    await enviar(telefono, "Disculpa, tuve un problema para responderte. Escríbeme de nuevo en un momento 🙏").catch(() => {});
  }
}

export function comandoDueno(texto) {
  const [comando, ...resto] = texto.trim().split(/\s+/);
  const tel = (resto[0] || "").replace(/\D/g, "");

  switch (comando.toLowerCase()) {
    case "/reanudar":
      if (!tel) return "Uso: /reanudar 593991234567";
      pausarConversacion(tel, false);
      return `El agente vuelve a atender a +${tel}.`;
    case "/pausar":
      if (!tel) return "Uso: /pausar 593991234567";
      pausarConversacion(tel, true);
      return `El agente deja de responder a +${tel} hasta que escribas /reanudar ${tel}.`;
    case "/estado": {
      // /estado P00001 En camino con Servientrega guia:123456
      const [pedidoId, ...palabras] = resto;
      let guia = "";
      const estado = palabras
        .filter((w) => (w.toLowerCase().startsWith("guia:") ? ((guia = w.slice(5)), false) : true))
        .join(" ");
      if (!pedidoId || !estado) return "Uso: /estado P00001 En camino con Servientrega guia:123456";
      const pedido = actualizarEstadoPedido(pedidoId, estado, guia);
      return pedido ? `Pedido ${pedido.id}: "${pedido.estado}"${pedido.guia ? ` · guía ${pedido.guia}` : ""}` : `No existe el pedido ${pedidoId}.`;
    }
    default:
      return [
        "Comandos:",
        "/pausar 5939XXXXXXXX → tú atiendes ese chat",
        "/reanudar 5939XXXXXXXX → el agente vuelve a atender",
        "/estado P00001 En camino guia:123456 → actualiza lo que ve el cliente",
      ].join("\n");
  }
}
