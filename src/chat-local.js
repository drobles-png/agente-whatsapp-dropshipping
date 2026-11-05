// Simulador: chatea con el agente desde la terminal, sin WhatsApp ni Meta.
// Solo necesita ANTHROPIC_API_KEY en .env.
import readline from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { responder } from "./agente.js";
import { usarCanalAvisos } from "./avisos.js";
import { comandoDueno } from "./entrada.js";

const TELEFONO = "593900000000";
const NOMBRE = "Cliente de prueba";

usarCanalAvisos(async (texto) => {
  console.log(`\n\x1b[33m── Aviso al dueño ──\n${texto}\n────────────────────\x1b[0m\n`);
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("Simulador del agente. Escribe como si fueras un cliente.");
console.log("Comandos: /reiniciar (borra esta conversación), /reanudar, /estado P00001 texto, /salir\n");

while (true) {
  const texto = (await rl.question("\x1b[36mTú:\x1b[0m ")).trim();
  if (!texto) continue;
  if (texto === "/salir") break;
  if (texto === "/reiniciar") {
    fs.rmSync(path.join(config.carpetaDatos, "conversaciones", `${TELEFONO}.json`), { force: true });
    console.log("Conversación borrada.\n");
    continue;
  }
  if (texto.startsWith("/")) {
    const [cmd, ...resto] = texto.split(" ");
    const conTelefono = ["/reanudar", "/pausar"].includes(cmd) && !resto.length ? `${cmd} ${TELEFONO}` : texto;
    console.log(comandoDueno(conTelefono), "\n");
    continue;
  }

  try {
    const respuesta = await responder({ telefono: TELEFONO, nombre: NOMBRE, texto });
    console.log(respuesta ? `\x1b[32mAgente:\x1b[0m ${respuesta}\n` : "(chat pausado: lo atiende un asesor — /reanudar para volver)\n");
  } catch (err) {
    console.error("Error:", err.message, "\n");
  }
}
rl.close();
