// Inicia sesión en Dropi una sola vez para que el agente use su MCP.
// Uso: npm run conectar-dropi
import http from "node:http";
import { exec } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { ProveedorAuthDropi, nuevoTransporte, PUERTO_CALLBACK } from "./dropi-mcp.js";

function abrirNavegador(url) {
  const comando =
    process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(comando);
}

// Espera a que Dropi redirija a http://localhost:8765/callback?code=...
function esperarCodigo() {
  return new Promise((resolve, reject) => {
    const servidor = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PUERTO_CALLBACK}`);
      if (url.pathname !== "/callback") return res.writeHead(404).end();
      const codigo = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(codigo
        ? "<h2>✅ Dropi conectado. Ya puedes cerrar esta pestaña.</h2>"
        : `<h2>❌ No se pudo conectar: ${error ?? "sin código"}</h2>`);
      servidor.close();
      codigo ? resolve(codigo) : reject(new Error(error ?? "Dropi no devolvió código"));
    });
    servidor.listen(PUERTO_CALLBACK);
    setTimeout(() => { servidor.close(); reject(new Error("Tiempo agotado (5 min) esperando el login")); }, 5 * 60_000);
  });
}

const proveedor = new ProveedorAuthDropi((url) => {
  console.log("\nAbriendo el navegador para iniciar sesión en Dropi...");
  console.log("Si no se abre, copia este enlace:\n", url.toString(), "\n");
  abrirNavegador(url.toString());
});

async function conectar() {
  const cliente = new Client({ name: "agente-whatsapp", version: "0.1.0" });
  await cliente.connect(nuevoTransporte(proveedor));
  return cliente;
}

let cliente;
try {
  cliente = await conectar(); // si ya hay sesión guardada, entra directo
} catch (err) {
  if (!(err instanceof UnauthorizedError)) throw err;
  const transporte = nuevoTransporte(proveedor);
  const codigo = esperarCodigo();
  await new Client({ name: "agente-whatsapp", version: "0.1.0" }).connect(transporte).catch((e) => {
    if (!(e instanceof UnauthorizedError)) throw e;
  });
  await transporte.finishAuth(await codigo);
  cliente = await conectar();
}

const { tools } = await cliente.listTools();
console.log(`✅ Conectado a Dropi. Herramientas disponibles: ${tools.map((t) => t.name).join(", ")}`);
await cliente.close();
process.exit(0);
