import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import {
  VOICE_WS_MAX_PAYLOAD,
  createApp,
  cookieToken,
  handleVoiceSocket,
} from "./app.ts";
import { Engine } from "./engine.ts";
import { Store } from "./store.ts";
import { MetaProvider } from "./provider.ts";
import { getServerVoice } from "./tts-kokoro.ts";
import dotenv from "dotenv";
import {runtimeConfig} from "./runtime-config.ts";

dotenv.config({path:[".env.local",".env"],quiet:true});

const {production,port,origin,host}=runtimeConfig();
const engine = new Engine(
  new Store(resolve(process.env.GLINT_DATA_DIR ?? ".data", "glint.sqlite")),
  new MetaProvider(),
);
const app = createApp(engine, origin, production);
const server = createServer(app);
let draining=false;
// Does not create a session, expose credentials or call an AI provider.
app.get("/healthz",(_req,res)=>res.status(draining?503:200).set("Cache-Control","no-store").json({status:draining?"draining":"ok"}));
if (!production) {
  const { createServer: vite } = await import("vite");
  const frontend = await vite({
    optimizeDeps: { entries: ["index.html"] },
    server: {
      middlewareMode: true,
      ws: { server },
      fs: {
        deny: [
          ".env",
          ".env.*",
          "**/.data/**",
          "**/*.sqlite*",
          "**/server/**",
          "**/tests/**",
          "**/.git/**",
          "*.{crt,pem}",
        ],
      },
    },
    appType: "spa",
  });
  app.use(frontend.middlewares);
} else {
  app.use(express.static(resolve("dist"), { index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const voice = new WebSocketServer({
  noServer: true,
  maxPayload: VOICE_WS_MAX_PAYLOAD,
});
server.on("upgrade", (req, socket, head) => {
  if(draining){socket.destroy();return;}
  if(req.url!=="/events"&&req.url!=="/voice-stream"){if(production)socket.destroy();return;}
  const session = engine.existing(cookieToken(req.headers.cookie));
  if (!session || req.headers.origin !== origin) {
    if (req.url === "/voice-stream")
      console.warn("[glint-voice] upgrade rejected (session or origin)");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  if (req.url === "/voice-stream") {
    voice.handleUpgrade(req, socket, head, (client) =>
      handleVoiceSocket(client, session, engine),
    );
    return;
  }
  ws.handleUpgrade(req, socket, head, (client) => {
    client.send(JSON.stringify({ type: "connected", serverTime: Date.now() }));
    const timer = setInterval(() => {
      if (Date.now() - session.lastSeen > 2 * 3600000) {
        client.close(1008, "Session expired");
        return;
      }
      client.send(
        JSON.stringify({ type: "status", view: engine.view(session) }),
      );
    }, 5000);
    client.on("message", () =>
      client.close(1008, "Control messages use the authenticated HTTP API"),
    );
    client.on("close", () => {
      clearInterval(timer);
      engine.phase(session, "paused");
    });
  });
});
const cleanup = setInterval(() => engine.cleanup(), 60000);
cleanup.unref();
server.listen(port, host, () =>
  console.log(
    `Glint ready: ${origin} (${production?"production":"development"})`,
  ),
);
// Warm the neural voice beside startup so the first spoken reply skips the
// model load; failures stay cached and voiceless, never fatal.
void getServerVoice().then((voice) => {
  if (voice) console.info(`Glint voice ready: ${voice.name}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if(draining)return;draining=true;
    clearInterval(cleanup);
    for(const client of [...voice.clients,...ws.clients])client.terminate();
    voice.close();ws.close();
    const deadline=setTimeout(()=>{engine.close();process.exit(0);},10000);deadline.unref();
    server.close(()=>{clearTimeout(deadline);engine.close();process.exit(0);});
  });
