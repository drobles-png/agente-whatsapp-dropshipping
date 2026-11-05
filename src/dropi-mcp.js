// Conexión al MCP oficial de Dropi (https://mcp.dropi.co/mcp) con inicio de sesión OAuth.
// Te conectas una vez con `npm run conectar-dropi`; los tokens quedan en datos/dropi-auth.json
// y se renuevan solos.
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "./config.js";

export const URL_MCP_DROPI = new URL("https://mcp.dropi.co/mcp");
export const PUERTO_CALLBACK = 8765;
const archivoAuth = path.join(config.carpetaDatos, "dropi-auth.json");

function leerAuth() {
  try {
    return JSON.parse(fs.readFileSync(archivoAuth, "utf8"));
  } catch {
    return {};
  }
}

function guardarAuth(cambios) {
  fs.writeFileSync(archivoAuth, JSON.stringify({ ...leerAuth(), ...cambios }, null, 2));
}

export const dropiConectado = () => Boolean(leerAuth().tokens);

/** Implementa lo que el SDK de MCP necesita para el OAuth de Dropi. */
export class ProveedorAuthDropi {
  constructor(alPedirLogin = () => {}) {
    this.alPedirLogin = alPedirLogin;
  }
  get redirectUrl() {
    return `http://localhost:${PUERTO_CALLBACK}/callback`;
  }
  get clientMetadata() {
    return {
      client_name: "Agente WhatsApp (dropshipping)",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    };
  }
  clientInformation() { return leerAuth().cliente; }
  saveClientInformation(cliente) { guardarAuth({ cliente }); }
  tokens() { return leerAuth().tokens; }
  saveTokens(tokens) { guardarAuth({ tokens, actualizado: new Date().toISOString() }); }
  saveCodeVerifier(verificador) { guardarAuth({ verificador }); }
  codeVerifier() { return leerAuth().verificador; }
  redirectToAuthorization(url) { this.alPedirLogin(url); }
  invalidateCredentials(alcance) {
    const auth = leerAuth();
    if (alcance === "all" || alcance === "tokens") delete auth.tokens;
    if (alcance === "all" || alcance === "client") delete auth.cliente;
    fs.writeFileSync(archivoAuth, JSON.stringify(auth, null, 2));
  }
}

export function nuevoTransporte(proveedor) {
  return new StreamableHTTPClientTransport(URL_MCP_DROPI, { authProvider: proveedor });
}

let clienteListo = null;

async function cliente() {
  if (!clienteListo) {
    clienteListo = (async () => {
      const proveedor = new ProveedorAuthDropi(() => {
        throw new Error("La sesión de Dropi expiró. Ejecuta: npm run conectar-dropi");
      });
      const c = new Client({ name: "agente-whatsapp", version: "0.1.0" });
      await c.connect(nuevoTransporte(proveedor));
      return c;
    })().catch((err) => {
      clienteListo = null;
      throw err;
    });
  }
  return clienteListo;
}

/** Llama una herramienta del MCP de Dropi y devuelve su respuesta en texto. */
export async function llamarDropi(nombre, argumentos = {}) {
  let c = await cliente();
  let resultado;
  try {
    resultado = await c.callTool({ name: nombre, arguments: argumentos });
  } catch (err) {
    // Conexión vieja o caída: se reconecta una vez.
    clienteListo = null;
    c = await cliente();
    resultado = await c.callTool({ name: nombre, arguments: argumentos });
  }
  const texto = (resultado.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (resultado.isError) throw new Error(`Dropi (${nombre}): ${texto}`);
  return texto;
}
