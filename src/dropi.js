// Conexión con Dropi.
//
// Modo "manual" (por defecto): no llama a Dropi. El pedido queda guardado y te llega un aviso
// con los datos listos para copiar en Dropi > Pedidos > Crear pedido.
//
// Modo "api": crea la orden con el token de integración de Dropi (Mis integraciones).
// IMPORTANTE: Dropi no publica su API abiertamente. Los nombres de campos de armarOrden() y el
// encabezado de autenticación son una base razonable, pero hay que confirmarlos con la
// documentación que entrega Dropi junto al token antes de usarlo en producción. Si la llamada
// falla, el pedido NO se pierde: se guarda y te llega el aviso para subirlo a mano.
import { config } from "./config.js";

const { modo, apiUrl, token } = config.dropi;

export const dropiActivo = modo === "api" && apiUrl && token;

function armarOrden(pedido, producto) {
  const [nombre, ...apellidos] = pedido.nombre_completo.trim().split(/\s+/);
  return {
    type: "FINAL_ORDER",
    rate_type: "CON RECAUDO", // contra entrega
    total_order: pedido.total,
    name: nombre,
    surname: apellidos.join(" "),
    phone: pedido.telefono_contacto,
    client_email: "",
    dni: pedido.cedula || "",
    state: pedido.provincia,
    city: pedido.ciudad,
    dir: `${pedido.direccion}. Ref: ${pedido.referencia}`,
    notes: [pedido.variante && `Variante: ${pedido.variante}`, pedido.notas].filter(Boolean).join(" · "),
    products: [
      {
        id: producto.dropi_producto_id,
        variation_id: producto.dropi_variacion_id || null,
        quantity: pedido.cantidad,
        price: producto.precio,
      },
    ],
  };
}

// Devuelve { ok, idDropi?, error? }
export async function crearOrdenDropi(pedido, producto) {
  if (!dropiActivo) return { ok: false, error: "Dropi en modo manual" };
  if (!producto.dropi_producto_id) {
    return { ok: false, error: `El producto ${producto.id} no tiene dropi_producto_id en el catálogo` };
  }
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "dropi-integration-key": token },
      body: JSON.stringify(armarOrden(pedido, producto)),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || datos.isSuccess === false) {
      return { ok: false, error: `Dropi ${res.status}: ${JSON.stringify(datos).slice(0, 300)}` };
    }
    return { ok: true, idDropi: datos.objects?.id ?? datos.id ?? null };
  } catch (err) {
    return { ok: false, error: `Dropi no respondió: ${err.message}` };
  }
}
