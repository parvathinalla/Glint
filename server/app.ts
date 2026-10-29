import express from "express";
import helmet from "helmet";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Engine, type Session } from "./engine.ts";
import { Problem } from "./provider.ts";
import { agentInput, observeInput } from "../shared/agent.ts";

export const cookieToken = (header = "") =>
  header
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("glint_session="))
    ?.slice(14);
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const observation = z.object({
  mode: z.enum(["replay", "live"]),
  question: z
    .string()
    .trim()
    .max(1000)
    .default(
      "Check the visible parts against the confirmed instructions. Ask for a better view if uncertain.",
    ),
  model: z.string().max(150).default(""),
  revision: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  capturedAt: z.number(),
  image: z.string().max(850000).optional(),
  requestId: z.string().uuid(),
});
function validateCameraImage(image: string, maxBytes = 600000) {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image))
    throw new Problem(
      400,
      "IMAGE_INVALID",
      "Use a captured camera JPEG, not a remote image URL.",
    );
  const bytes = Buffer.from(image.split(",")[1], "base64");
  if (
    bytes.length < 20 ||
    bytes.length > maxBytes ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Problem(
      400,
      "IMAGE_INVALID",
      "The camera image is invalid or too large.",
    );
}
/** Minimal browser-socket surface the voice handler needs; ws satisfies it. */
export type VoiceSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
};
/**
 * Transport ceiling above the 64 KB engine frame cap, so oversize frames
 * get a proper error instead of a dropped socket.
 */
export const VOICE_WS_MAX_PAYLOAD = 262144;
const voiceControl = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("open"),
    requestId: z.string().uuid(),
    epoch: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("close") }),
]);
function toVoiceBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data) && data.every((x) => x instanceof Uint8Array))
    return new Uint8Array(Buffer.concat(data));
  return null;
}
/**
 * One browser socket carrying voice turns: text control frames plus binary
 * PCM16 mono, answered with partial/final/error JSON. The socket outlives
 * a turn so the next open reuses it; closing the socket ends the stream.
 */
export function handleVoiceSocket(
  client: VoiceSocket,
  session: Session,
  engine: Engine,
) {
  const send = (event: unknown) => {
    try {
      client.send(JSON.stringify(event));
    } catch {
      // The browser is gone; dropping the event is the whole job.
    }
  };
  const fail = (error: unknown) => {
    if (error instanceof Problem)
      send({ type: "error", code: error.code, message: error.message });
    else if (error instanceof z.ZodError)
      send({
        type: "error",
        code: "INVALID_INPUT",
        message:
          "Some fields are missing or invalid. Review the form and try again.",
      });
    else
      send({
        type: "error",
        code: "UNAVAILABLE",
        message:
          "The operation could not finish. Nothing was retried automatically.",
      });
  };
  client.on("message", (data) => {
    try {
      if (typeof data !== "string") {
        const bytes = toVoiceBytes(data);
        if (!bytes) {
          fail(
            new Problem(
              400,
              "AUDIO_INVALID",
              "The voice frame is not valid audio.",
            ),
          );
          return;
        }
        engine.voiceFrame(session, bytes);
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        fail(
          new Problem(
            400,
            "INVALID_INPUT",
            "The voice control message is not valid.",
          ),
        );
        return;
      }
      const control = voiceControl.parse(raw);
      if (control.type === "open") {
        engine.voiceOpen(session, control.epoch, control.requestId, {
          partial: (text) => send({ type: "partial", text }),
          turn: (turnId, transcript) => send({ type: "turn", turnId, transcript }),
          final: (transcript) => send({ type: "final", transcript }),
          error: (message) =>
            send({ type: "error", code: "ASR_ERROR", message }),
          gap: () => send({ type: "gap" }),
          closed: (info) => send({ type: "closed", ...info }),
        });
        send({ type: "opened" });
      } else if (control.type === "end") {
        engine.voiceFrame(session, JSON.stringify({ type: "end" }));
      } else {
        engine.voiceClose(session);
        send({ type: "closed", code: 1000, retryable: false });
      }
    } catch (error) {
      fail(error);
    }
  });
  client.on("close", () => engine.voiceClose(session));
}
export function createApp(engine: Engine, origin: string, production = false) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    let path: string;
    try {
      path = decodeURIComponent(req.path).replaceAll("\\", "/");
    } catch {
      res.sendStatus(400);
      return;
    }
    if (
      path
        .split("/")
        .some((part) =>
          /^(?:\.data|\.git|server|tests)$|^\.env(?:\.|$)|\.sqlite(?:-|$)/i.test(
            part,
          ),
        )
    ) {
      res.status(403).type("text").send("Private application resource");
      return;
    }
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
              styleSrc: ["'self'"],
              imgSrc: ["'self'", "blob:", "data:"],
              mediaSrc: ["'self'", "blob:"],
              workerSrc: ["'self'"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Permissions-Policy": "camera=(self), microphone=(self)",
    });
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (req.headers.origin && req.headers.origin !== origin)
      return next(
        new Problem(
          403,
          "ORIGIN",
          "This request came from a different origin.",
        ),
      );
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin)
      return next(
        new Problem(
          403,
          "ORIGIN",
          "A matching application origin is required.",
        ),
      );
    next();
  });
  app.use(express.json({ limit: "1mb", strict: true }));
  app.get("/api/session", (req, res) => {
    const { session, token } = engine.session(cookieToken(req.headers.cookie));
    if (token)
      res.cookie("glint_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        path: "/",
        maxAge: 7 * 86400000,
      });
    // Reload/resume starts a new observation epoch; never resurrect a previous camera run.
    res.json(
      session.phase === "active"
        ? engine.phase(session, "paused")
        : engine.view(session),
    );
  });
  app.use("/api", (req, res, next) => {
    const session = engine.existing(cookieToken(req.headers.cookie));
    if (!session)
      return next(
        new Problem(
          401,
          "SESSION_REQUIRED",
          "Reload to create a private local session.",
        ),
      );
    const csrf = req.header("x-glint-csrf") ?? "";
    if (req.method !== "GET" && !equal(csrf, session.csrf))
      return next(
        new Problem(
          403,
          "CSRF",
          "Session authorization expired. Reload before continuing.",
        ),
      );
    res.locals.session = session;
    next();
  });
  const s = (res: express.Response) => res.locals.session as Session;
  app.post("/api/observe", async (req, res) => {
    const input = observeInput.parse(req.body);
    input.frames.forEach((frame) => validateCameraImage(frame.image, 90000));
    const session = s(res);
    res.on("close", () => {
      if (
        !res.writableEnded &&
        session.seen.has(input.requestId) &&
        session.epoch === input.epoch
      )
        engine.phase(session, "paused");
    });
    res.json(await engine.observe(session, input));
  });
  app.post("/api/vision/stop", (_req, res) =>
    res.json(engine.clearVision(s(res))),
  );
  for (const route of ["agent", "agent/stream"])
    app.post(`/api/${route}`, async (req, res) => {
      const input = agentInput.parse(req.body);
      input.frames?.forEach((frame) => validateCameraImage(frame.image, 90000));
      if (input.image) {
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.image))
          throw new Problem(
            400,
            "IMAGE_INVALID",
            "Use a camera JPEG, not a remote image.",
          );
        const bytes = Buffer.from(input.image.split(",")[1], "base64");
        if (
          bytes.length < 20 ||
          bytes.length > 600000 ||
          bytes[0] !== 255 ||
          bytes[1] !== 216 ||
          bytes.at(-2) !== 255 ||
          bytes.at(-1) !== 217
        )
          throw new Problem(
            400,
            "IMAGE_INVALID",
            "The camera image is invalid.",
          );
      }
      if (route === "agent") {
        res.json(await engine.converse(s(res), input));
        return;
      }
      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      const session = s(res);
      let finished = false;
      const emit = (event: unknown) => {
        if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      res.on("close", () => {
        if (!finished && session.epoch === input.epoch)
          engine.phase(session, "paused");
      });
      try {
        const reply = await engine.converse(session, input, (text) =>
          emit({ type: "delta", text }),
        );
        emit({ type: "done", reply });
      } catch (error) {
        emit({
          type: "error",
          message:
            error instanceof Problem
              ? error.message
              : "The response stream was interrupted. You can retry your message.",
        });
      } finally {
        finished = true;
        res.end();
      }
    });
  app.post("/api/voice", async (req, res) => {
    const v = z
      .object({
        audio: z
          .string()
          .max(970000)
          .regex(/^[A-Za-z0-9+/]+=*$/),
        epoch: z.number().int().nonnegative(),
        requestId: z.string().uuid(),
      })
      .parse(req.body);
    const audio = Buffer.from(v.audio, "base64");
    // Only bounded mono 24 kHz PCM WAV produced by the microphone client.
    if (
      audio.length < 48 ||
      audio.length > 720044 ||
      audio.toString("ascii", 0, 4) !== "RIFF" ||
      audio.toString("ascii", 8, 12) !== "WAVE" ||
      audio.toString("ascii", 12, 16) !== "fmt " ||
      audio.readUInt32LE(16) !== 16 ||
      audio.readUInt16LE(20) !== 1 ||
      audio.readUInt16LE(22) !== 1 ||
      audio.readUInt32LE(24) !== 24000 ||
      audio.readUInt16LE(34) !== 16 ||
      audio.toString("ascii", 36, 40) !== "data" ||
      audio.readUInt32LE(40) !== audio.length - 44
    )
      throw new Problem(
        400,
        "AUDIO_INVALID",
        "Use a microphone sentence of up to 15 seconds.",
      );
    res.json(await engine.transcribe(s(res), audio, v.epoch, v.requestId));
  });
  app.post("/api/new", (_req, res) =>
    res.json(engine.resetConversation(s(res))),
  );
  app.post("/api/task", (req, res) =>
    res.json(engine.setTask(s(res), req.body)),
  );
  app.post("/api/demo", (_req, res) =>
    res.json(engine.setTask(s(res), null, true)),
  );
  app.post("/api/confirm", (req, res) =>
    res.json(
      engine.confirm(
        s(res),
        z.object({ revision: z.number().int() }).parse(req.body).revision,
      ),
    ),
  );
  app.post("/api/step", (req, res) => {
    const v = z
      .object({ id: z.string(), done: z.boolean(), revision: z.number().int() })
      .parse(req.body);
    res.json(engine.report(s(res), v.id, v.done, v.revision));
  });
  app.post("/api/phase", (req, res) =>
    res.json(
      engine.phase(
        s(res),
        z
          .object({ phase: z.enum(["ready", "active", "paused"]) })
          .parse(req.body).phase,
      ),
    ),
  );
  app.post("/api/key", async (req, res) => {
    const v = z.object({ key: z.string().max(512) }).parse(req.body);
    res.json(await engine.connect(s(res), v.key));
  });
  app.delete("/api/key", (_req, res) => res.json(engine.disconnect(s(res))));
  app.delete("/api/session", (_req, res) => res.json(engine.forget(s(res))));
  for (const route of ["check", "chat"])
    app.post(`/api/${route}`, async (req, res) => {
      const input = observation.parse(req.body);
      if (route === "check" && input.mode === "live") {
        if (
          !input.image ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.image)
        )
          throw new Problem(
            400,
            "IMAGE_INVALID",
            "Use a captured JPEG frame, not a remote image URL.",
          );
        const bytes = Buffer.from(input.image.split(",")[1], "base64");
        if (
          bytes.length > 600000 ||
          bytes.length < 20 ||
          bytes[0] !== 255 ||
          bytes[1] !== 216 ||
          bytes[bytes.length - 2] !== 255 ||
          bytes[bytes.length - 1] !== 217
        )
          throw new Problem(
            400,
            "IMAGE_INVALID",
            "The frame is invalid or exceeds 600 KB.",
          );
      }
      res.json(await engine.respond(s(res), input, route === "check"));
    });
  app.use("/api", (_req, _res, next) =>
    next(new Problem(404, "NOT_FOUND", "This operation does not exist.")),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof Problem)
        return res
          .status(error.status)
          .json({ code: error.code, message: error.message });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          code: "INVALID_INPUT",
          message:
            "Some fields are missing or invalid. Review the form and try again.",
        });
      if (
        typeof error === "object" &&
        error &&
        "type" in error &&
        error.type === "entity.too.large"
      )
        return res.status(413).json({
          code: "TOO_LARGE",
          message: "The request exceeds the allowed size.",
        });
      // Do not log arbitrary errors: upstream errors may contain a key, transcript, or image.
      return res.status(502).json({
        code: "UNAVAILABLE",
        message:
          "The operation could not finish. Nothing was retried automatically.",
      });
    },
  );
  return app;
}
