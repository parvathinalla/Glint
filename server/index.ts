import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { createApp, cookieToken } from "./app.ts";
import { Engine } from "./engine.ts";
import { Store } from "./store.ts";
import { MetaProvider } from "./provider.ts";

const production = process.argv.includes("--production");
const port = Number(process.env.PORT ?? 3100);
const origin = process.env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
if (production && !origin.startsWith("https://"))
  throw new Error(
    "Production mode requires an HTTPS APP_ORIGIN and a reviewed TLS proxy. Use npm run dev for local preview.",
  );
const engine = new Engine(
  new Store(resolve(process.env.GLINT_DATA_DIR ?? ".data", "glint.sqlite")),
  new MetaProvider(),
);
const app = createApp(engine, origin, production);
const server = createServer(app);
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
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/events") return;
  const session = engine.existing(cookieToken(req.headers.cookie));
  if (!session || req.headers.origin !== origin) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
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
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Glint local preview: ${origin} (local session auth; public deployment gated)`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(cleanup);
    ws.close();
    server.close();
    engine.close();
    process.exit(0);
  });
