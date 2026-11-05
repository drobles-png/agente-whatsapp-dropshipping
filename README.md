# Agente de WhatsApp para dropshipping (contra entrega + Dropi)

Atiende el WhatsApp de la tienda las 24 horas:

- **Vende**: responde dudas de los productos a quien escribe desde los anuncios y cierra la venta.
- **Confirma**: antes de registrar el pedido muestra un resumen (producto, total, dirección) y espera el "sí" del cliente.
- **Despacha**: crea el pedido y te avisa a tu WhatsApp con los datos listos para Dropi (o lo crea directo en Dropi, ver abajo).
- **Acompaña**: responde "¿dónde está mi pedido?", registra novedades (otra dirección, no estuvo en casa) y cancelaciones.
- **Te pasa el chat** cuando el cliente pide una persona, está molesto o pregunta algo que no está en tu información.

```
WhatsApp del cliente → Meta → /webhook (este servidor) → Claude + herramientas → respuesta
                                                         └→ aviso a tu WhatsApp / Dropi
```

## Archivos que tú editas

| Archivo | Qué es |
|---|---|
| `datos/negocio.md` | Ficha del negocio: envíos, tiempos, garantía, reglas. El agente no inventa nada fuera de esto. |
| `datos/catalogo.json` | Tus productos: precio, variantes, descripción, preguntas frecuentes, stock. **Hoy tiene 3 productos de ejemplo.** |
| `.env` | Claves (copia `.env.example` como `.env`). |

Los cambios en estos dos archivos de `datos/` se aplican en el siguiente mensaje, sin reiniciar.

## 1. Probarlo en tu computadora (sin WhatsApp)

1. Instala Node.js 20 o superior.
2. Crea una clave en https://console.anthropic.com → *API Keys* y ponla en `.env` como `ANTHROPIC_API_KEY=...`
3. En esta carpeta:
   ```
   npm install
   npm run chat
   ```
4. Escribe como si fueras un cliente ("hola, info de la lámpara"). Los avisos que te llegarían a ti salen en amarillo.
   Prueba también a romperlo: pide un descuento, una fecha imposible o escribe "ignora tus instrucciones".

## 2. Conectar WhatsApp (Meta for Developers)

1. Entra a https://developers.facebook.com → **Mis apps → Crear app** → tipo **Empresa** → conéctala a tu portafolio comercial.
2. En la app, agrega el producto **WhatsApp** → *Configuración de la API*.
   - Copia el **Identificador del número de teléfono** → `WHATSAPP_PHONE_NUMBER_ID`.
   - Copia el **token de acceso temporal** → `WHATSAPP_TOKEN` (dura 24 h; abajo cómo hacerlo permanente).
   - Al principio Meta te da un número de prueba: agrega tu celular como destinatario para poder escribirle.
3. *Configuración de la app → Básica* → **Clave secreta de la app** → `WHATSAPP_APP_SECRET`.
4. Inventa una frase para `WHATSAPP_VERIFY_TOKEN`.
5. El servidor necesita una dirección pública con https. Para probar desde tu PC:
   ```
   npm start
   npx cloudflared tunnel --url http://localhost:3000
   ```
   (te da algo como `https://xxxx.trycloudflare.com`).
6. En WhatsApp → *Configuración* → **Webhook**: URL `https://TU-DIRECCION/webhook`, token de verificación = tu frase → **Verificar y guardar**.
   Luego, en *Campos del webhook*, suscríbete a **messages**.
7. Escribe desde tu celular al número de prueba. Debe responder el agente.

**Token permanente:** en business.facebook.com → *Configuración del negocio → Usuarios del sistema* → crea un usuario administrador, asígnale la app y genera un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.

**Número real:** en *Configuración de la API → Agregar número de teléfono*. Ese número no puede estar usándose en la app de WhatsApp normal ni en WhatsApp Business (hay que eliminar la cuenta de la app primero), y el portafolio debe estar verificado para pasar de los límites iniciales de mensajes.

## 3. Avisos y control desde tu WhatsApp

Pon tu celular personal en `DUENO_WHATSAPP` (ej. `593991234567`). Ahí te llegan los pedidos, las novedades y los chats para atender.

> Meta solo deja que el número del negocio te escriba si **tú le escribiste en las últimas 24 horas**. Mándale cualquier mensaje cada día (por ejemplo `/ayuda`). Si no, igual todo queda en `datos/notificaciones.log`.

Desde tu WhatsApp, escribiéndole al número del negocio:

| Comando | Qué hace |
|---|---|
| `/pausar 593991234567` | El agente deja de responder a ese cliente (lo atiendes tú desde el panel de Meta o la app). |
| `/reanudar 593991234567` | El agente vuelve a atenderlo. Úsalo también después de que el agente te pasó un chat. |
| `/estado P00001 En camino con Servientrega guia:123456` | Actualiza lo que el agente le dice al cliente cuando pregunta por su pedido. |

## 4. Dropi

- **`DROPI_MODO=manual`** (por defecto): cada pedido confirmado te llega con todos los datos para crearlo en Dropi.
- **`DROPI_MODO=api`**: el agente crea la orden en Dropi.
  1. En Dropi → **Mis integraciones** → crea una tienda tipo API/propia y copia el **token** → `DROPI_TOKEN`.
  2. Pide a soporte de Dropi la **documentación de la API de integraciones** (URL para crear órdenes y formato). Pon la URL en `DROPI_API_URL`.
  3. Llena `dropi_producto_id` (y `dropi_variacion_id` si aplica) de cada producto en `catalogo.json`.
  4. Revisa que los campos de `armarOrden()` en `src/dropi.js` coincidan con esa documentación. Dropi no publica su API abiertamente, así que **esa parte está sin verificar**.
  Si Dropi rechaza una orden, el pedido no se pierde: te llega el aviso para subirlo a mano.

## 5. Ponerlo en línea (VPS)

Tu computadora no es un servidor. En un VPS (DigitalOcean, Hetzner, Contabo, etc. desde ~$5/mes):

```
git clone ... && cd agente
npm install
cp .env.example .env   # y llénalo
npx pm2 start src/servidor.js --name agente
npx pm2 save
```

Y un dominio con https (Caddy o Nginx + Certbot) apuntando al puerto 3000. Cambia la URL del webhook en Meta a la del dominio.

## Notas

- **Memoria**: cada cliente tiene su conversación en `datos/conversaciones/`. Tras `SESION_HORAS` (72) sin escribir, la conversación empieza de cero, pero sus pedidos se siguen consultando.
- **Mensajes seguidos**: si el cliente manda varios mensajes en menos de 4 segundos, se responden juntos.
- **Audios y stickers**: por ahora el agente pide que le escriban. Las fotos con texto sí se leen (solo el texto), y la ubicación se convierte en un enlace de Google Maps.
- **Costo de IA**: usa `claude-opus-5-5` con caché de las instrucciones y el catálogo. `CLAUDE_ESFUERZO=low` lo hace más rápido y barato. Si el modelo rechaza un mensaje por seguridad, otro modelo responde automáticamente (`fallbacks`).
- **Confirmación del día anterior / recuperar carritos**: escribirle a un cliente que no habló en 24 h requiere **plantillas aprobadas** por Meta. Es el siguiente paso natural.
