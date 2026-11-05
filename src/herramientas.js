// Herramientas que el agente puede usar. Así pasa de "conversar" a "actuar".
// El teléfono del cliente nunca lo decide el modelo: llega desde el webhook.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import {
  guardarPedido,
  nuevoIdPedido,
  pedidosDeCliente,
  listarPedidos,
} from "./almacen.js";
import { crearOrdenDropi, dropiActivo } from "./dropi.js";
import { avisarDueno } from "./avisos.js";

export function cargarCatalogo() {
  const archivo = path.join(config.carpetaDatos, "catalogo.json");
  return JSON.parse(fs.readFileSync(archivo, "utf8")).productos;
}

export const definiciones = [
  {
    name: "crear_pedido",
    description:
      "Registra un pedido contra entrega y lo envía a despacho. Úsala SOLO después de haberle mostrado al cliente el resumen completo (producto, variante, cantidad, total a pagar y datos de entrega) y de que el cliente lo confirmó expresamente. Un pedido por producto: si lleva dos productos distintos, llámala dos veces.",
    input_schema: {
      type: "object",
      properties: {
        producto_id: { type: "string", description: "El id del producto en el catálogo" },
        variante: { type: "string", description: "Talla, color o modelo elegido. Vacío si el producto no tiene variantes." },
        cantidad: { type: "integer", minimum: 1 },
        nombre_completo: { type: "string", description: "Nombre y apellido de quien recibe" },
        telefono_contacto: { type: "string", description: "Celular de quien recibe, para el transportista" },
        cedula: { type: "string", description: "Cédula si el cliente la dio; vacío si no" },
        provincia: { type: "string" },
        ciudad: { type: "string" },
        direccion: { type: "string", description: "Calle principal, número y calle secundaria" },
        referencia: { type: "string", description: "Referencia para encontrar el lugar" },
        notas: { type: "string", description: "Indicaciones extra (horario para recibir, etc.). Vacío si no hay." },
        cliente_confirmo: { type: "boolean", description: "true solo si el cliente confirmó el resumen" },
      },
      required: [
        "producto_id", "cantidad", "nombre_completo", "telefono_contacto",
        "provincia", "ciudad", "direccion", "referencia", "cliente_confirmo",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_pedidos",
    description:
      "Devuelve los pedidos de este cliente con su estado y guía. Úsala cuando pregunte por su pedido, cuándo llega, o antes de registrar una novedad o cancelación.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "registrar_novedad",
    description:
      "Registra un cambio o problema en un pedido ya hecho (cambio de dirección, no estuvo cuando llegó el transportista, quiere otra fecha, producto dañado o equivocado) para que el equipo lo gestione con la transportadora.",
    input_schema: {
      type: "object",
      properties: {
        pedido_id: { type: "string" },
        tipo: {
          type: "string",
          enum: ["cambio_direccion", "cambio_fecha", "cliente_ausente", "producto_danado_o_equivocado", "otro"],
        },
        detalle: { type: "string", description: "Qué pasó y los datos nuevos (dirección, fecha, etc.)" },
      },
      required: ["pedido_id", "tipo", "detalle"],
      additionalProperties: false,
    },
  },
  {
    name: "cancelar_pedido",
    description:
      "Solicita cancelar un pedido que el cliente ya no quiere. Antes intenta una sola vez entender el motivo y resolverlo (dudas, fecha, dirección).",
    input_schema: {
      type: "object",
      properties: {
        pedido_id: { type: "string" },
        motivo: { type: "string" },
      },
      required: ["pedido_id", "motivo"],
      additionalProperties: false,
    },
  },
  {
    name: "pasar_a_humano",
    description:
      "Pasa la conversación a un asesor humano y deja de responder en este chat. Úsala si el cliente lo pide, está molesto, pregunta algo que no está en la información del negocio, quiere un producto que no está en el catálogo, o hay un reclamo.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        resumen: { type: "string", description: "Resumen breve de la conversación para el asesor" },
      },
      required: ["motivo", "resumen"],
      additionalProperties: false,
    },
  },
];

function buscarPedidoDelCliente(telefono, pedidoId) {
  return pedidosDeCliente(telefono).find((p) => p.id === pedidoId?.trim().toUpperCase());
}

function textoPedido(p) {
  return [
    `Pedido ${p.id} · ${p.producto_nombre}${p.variante ? ` (${p.variante})` : ""} x${p.cantidad}`,
    `Total contra entrega: $${p.total.toFixed(2)}`,
    `Recibe: ${p.nombre_completo} · ${p.telefono_contacto}${p.cedula ? ` · CI ${p.cedula}` : ""}`,
    `Entrega: ${p.direccion}, ${p.ciudad}, ${p.provincia}. Ref: ${p.referencia}`,
    p.notas && `Notas: ${p.notas}`,
    `WhatsApp: +${p.telefono_whatsapp}`,
  ].filter(Boolean).join("\n");
}

const ejecutores = {
  async crear_pedido(entrada, { telefono }) {
    if (entrada.cliente_confirmo !== true) {
      return "No se creó: primero muestra el resumen al cliente y espera su confirmación.";
    }
    const faltan = ["nombre_completo", "telefono_contacto", "provincia", "ciudad", "direccion", "referencia"]
      .filter((c) => !String(entrada[c] ?? "").trim());
    if (faltan.length) return `No se creó: faltan estos datos: ${faltan.join(", ")}.`;

    const producto = cargarCatalogo().find((p) => p.id === entrada.producto_id);
    if (!producto) return `No se creó: no existe el producto "${entrada.producto_id}" en el catálogo.`;
    if (!producto.stock) return `No se creó: ${producto.nombre} está agotado.`;
    if (producto.variantes?.length && !producto.variantes.includes(entrada.variante)) {
      return `No se creó: la variante debe ser una de: ${producto.variantes.join(", ")}.`;
    }
    const cantidad = Number(entrada.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) {
      return "No se creó: la cantidad debe estar entre 1 y 10. Para más unidades pasa el chat a un asesor.";
    }

    const total = Math.round((producto.precio * cantidad + (producto.envio || 0)) * 100) / 100;
    const pedido = {
      id: nuevoIdPedido(),
      creado: new Date().toISOString(),
      telefono_whatsapp: telefono,
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      variante: entrada.variante || "",
      cantidad,
      total,
      nombre_completo: entrada.nombre_completo.trim(),
      telefono_contacto: entrada.telefono_contacto.trim(),
      cedula: entrada.cedula?.trim() || "",
      provincia: entrada.provincia.trim(),
      ciudad: entrada.ciudad.trim(),
      direccion: entrada.direccion.trim(),
      referencia: entrada.referencia.trim(),
      notas: entrada.notas?.trim() || "",
      estado: "Confirmado, pendiente de despacho",
      guia: "",
      id_dropi: null,
      novedades: [],
    };

    const dropi = await crearOrdenDropi(pedido, producto);
    if (dropi.ok) {
      pedido.id_dropi = dropi.idDropi;
      pedido.estado = "Creado en Dropi, pendiente de despacho";
    }
    guardarPedido(pedido);

    const cabecera = dropi.ok
      ? `✅ Pedido nuevo creado en Dropi (#${dropi.idDropi ?? "?"})`
      : dropiActivo
        ? `⚠️ Pedido nuevo — NO se pudo crear en Dropi, súbelo a mano.\nMotivo: ${dropi.error}`
        : "🛒 Pedido nuevo — súbelo a Dropi";
    await avisarDueno(`${cabecera}\n\n${textoPedido(pedido)}`);

    return `Pedido ${pedido.id} registrado. Total a pagar contra entrega: $${total.toFixed(2)}. Estado: ${pedido.estado}.`;
  },

  async consultar_pedidos(_entrada, { telefono }) {
    const pedidos = pedidosDeCliente(telefono);
    if (!pedidos.length) return "Este cliente no tiene pedidos registrados con este número de WhatsApp.";
    return JSON.stringify(
      pedidos.map((p) => ({
        id: p.id,
        fecha: p.creado.slice(0, 10),
        producto: `${p.producto_nombre}${p.variante ? ` (${p.variante})` : ""} x${p.cantidad}`,
        total: p.total,
        entrega: `${p.direccion}, ${p.ciudad}`,
        estado: p.estado,
        guia: p.guia || "aún sin guía",
        novedades: p.novedades.map((n) => `${n.tipo}: ${n.detalle}`),
      })),
      null,
      2,
    );
  },

  async registrar_novedad(entrada, { telefono }) {
    const pedido = buscarPedidoDelCliente(telefono, entrada.pedido_id);
    if (!pedido) return `No encontré el pedido ${entrada.pedido_id} para este cliente. Usa consultar_pedidos.`;
    pedido.novedades.push({ fecha: new Date().toISOString(), tipo: entrada.tipo, detalle: entrada.detalle });
    guardarPedido(pedido);
    await avisarDueno(
      `📦 Novedad en pedido ${pedido.id} (${entrada.tipo})\n${entrada.detalle}\n\n${textoPedido(pedido)}`,
    );
    return "Novedad registrada. El equipo la gestiona con la transportadora en horario de atención.";
  },

  async cancelar_pedido(entrada, { telefono }) {
    const pedido = buscarPedidoDelCliente(telefono, entrada.pedido_id);
    if (!pedido) return `No encontré el pedido ${entrada.pedido_id} para este cliente. Usa consultar_pedidos.`;
    pedido.estado = "Cancelación solicitada";
    pedido.novedades.push({ fecha: new Date().toISOString(), tipo: "cancelacion", detalle: entrada.motivo });
    guardarPedido(pedido);
    await avisarDueno(`❌ Cancelación solicitada: ${pedido.id}\nMotivo: ${entrada.motivo}\n\n${textoPedido(pedido)}`);
    return "Cancelación registrada. El equipo detiene el despacho si aún no salió.";
  },

  async pasar_a_humano(entrada, { telefono, conv }) {
    conv.pausado = true; // se guarda al terminar el turno
    await avisarDueno(
      `🙋 Chat para atender: +${telefono}\nMotivo: ${entrada.motivo}\n${entrada.resumen}\n\n` +
        `El agente dejó de responder en ese chat. Cuando termines, escribe: /reanudar ${telefono}`,
    );
    return "Listo: un asesor continúa la conversación. Despídete brevemente diciendo que un asesor le escribe en breve (en horario de atención).";
  },
};

export async function ejecutarHerramienta(nombre, entrada, contexto) {
  const ejecutor = ejecutores[nombre];
  if (!ejecutor) return { texto: `Herramienta desconocida: ${nombre}`, error: true };
  try {
    return { texto: await ejecutor(entrada ?? {}, contexto), error: false };
  } catch (err) {
    console.error(`Error en ${nombre}:`, err);
    return { texto: `Error interno al ejecutar ${nombre}. Pasa el chat a un asesor.`, error: true };
  }
}

// Para los comandos del dueño (/estado).
export function actualizarEstadoPedido(pedidoId, estado, guia) {
  const pedido = listarPedidos().find((p) => p.id === pedidoId.toUpperCase());
  if (!pedido) return null;
  pedido.estado = estado;
  if (guia) pedido.guia = guia;
  return guardarPedido(pedido);
}
