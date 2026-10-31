import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../server/app.ts";
import { Engine } from "../server/engine.ts";
import { Store } from "../server/store.ts";
import type { Provider } from "../server/provider.ts";
import type { View } from "../shared/model.ts";
import { AgentProvider } from "../server/agent-provider.ts";
const origin = "http://127.0.0.1:3100";
let server: Server, engine: Engine;
async function fixture(provider?: Provider, agent?: AgentProvider) {
  engine = new Engine(
    new Store(":memory:"),
    provider ?? {
      models: async () => ["muse-spark-test"],
      infer: async () => {
        throw Error("UNEXPECTED LIVE CALL");
      },
    },
    Date.now,
    agent,
  );
  server = createServer(createApp(engine, origin));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const r = await fetch(base + "/api/session");
  const cookie = r.headers.get("set-cookie")!.split(";")[0],
    view = (await r.json()) as View;
  const call = (
    path: string,
    body: unknown = {},
    options: {
      cookie?: string;
      origin?: string;
      csrf?: string;
      method?: string;
    } = {},
  ) =>
    fetch(base + "/api/" + path, {
      method: options.method ?? "POST",
      headers: {
        Cookie: options.cookie ?? cookie,
        Origin: options.origin ?? origin,
        "x-glint-csrf": options.csrf ?? view.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return { call, cookie, view, base, headers: r.headers };
}
afterEach(async () => {
  engine?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
describe("HTTP isolation and validation", () => {
  it("validates automatic camera sequences before dispatch and requires the private session", async () => {
    const f = await fixture();
    const now = Date.now();
    const body = {
      frames: [now - 1000, now].map((capturedAt) => ({
        image: "https://private.invalid/image.jpg",
        capturedAt,
      })),
      epoch: f.view.epoch,
      requestId: randomUUID(),
      model: "muse-spark-test",
    };
    expect((await f.call("observe", body, { csrf: "forged" })).status).toBe(
      403,
    );
    expect((await f.call("observe", body)).status).toBe(400);
    expect((await f.call("observe", { ...body, frames: [] })).status).toBe(400);
  });
  it("streams visible text before final completion through the authenticated route", async () => {
    const encoder = new TextEncoder();
    let output: ReadableStreamDefaultController<Uint8Array>;
    const transport = new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller;
      },
    });
    const agent = new AgentProvider(
      (async () =>
        new Response(transport, {
          headers: { "content-type": "text/event-stream" },
        })) as typeof fetch,
    );
    const f = await fixture(undefined, agent);
    const view = (await (
      await f.call("key", { key: "TEST_ONLY_KEY" })
    ).json()) as View;
    const body = {
      question: "Hello",
      model: "muse-spark-test",
      epoch: view.epoch,
      requestId: randomUUID(),
    };
    expect(
      (await f.call("agent/stream", body, { csrf: "forged" })).status,
    ).toBe(403);
    const response = await f.call("agent/stream", body);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    output!.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello. " })}\n\n`,
      ),
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      '"type":"delta"',
    );
    output!.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Hello. " }] }] } })}\n\n`,
      ),
    );
    output!.close();
    let rest = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      rest += decoder.decode(part.value);
    }
    expect(rest).toContain('"type":"done"');
    expect(rest).not.toContain("TEST_ONLY_KEY");
  });
  it("synths neural voice audio beside the reply stream when requested", async () => {
    process.env.GLINT_TTS_MOCK = "1";
    try {
      const encoder = new TextEncoder();
      let output: ReadableStreamDefaultController<Uint8Array>;
      const transport = new ReadableStream<Uint8Array>({
        start(controller) {
          output = controller;
        },
      });
      const agent = new AgentProvider(
        (async () =>
          new Response(transport, {
            headers: { "content-type": "text/event-stream" },
          })) as typeof fetch,
      );
      const f = await fixture(undefined, agent);
      const view = (await (
        await f.call("key", { key: "TEST_ONLY_KEY" })
      ).json()) as View;
      const response = await f.call("agent/stream", {
        question: "Hello",
        model: "muse-spark-test",
        epoch: view.epoch,
        requestId: randomUUID(),
        voice: "neural",
      });
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      output!.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "I can see you. " })}\n\n`,
        ),
      );
      output!.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "I can see you. " }] }] } })}\n\n`,
        ),
      );
      output!.close();
      let sse = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        sse += decoder.decode(part.value);
      }
      expect(sse).toContain('"type":"voice","mode":"neural"');
      expect(sse).toContain('"type":"audio"');
      expect(sse).toContain('"seq":0');
      expect(sse).toContain('"text":"I can see you."');
      const pcm = JSON.parse(
        sse
          .split("\n\n")
          .map((block) => block.replace(/^data: /, ""))
          .find((line) => line.includes('"type":"audio"'))!,
      ).pcm as string;
      expect(Buffer.from(pcm, "base64").length).toBeGreaterThan(1000);
      expect(sse).toContain('"type":"done"');
      expect(sse).toContain('"type":"voice-done"');
      expect(sse.indexOf('"type":"voice-done"')).toBeGreaterThan(
        sse.indexOf('"type":"done"'),
      );
    } finally {
      delete process.env.GLINT_TTS_MOCK;
    }
  });
  it("emits no voice events when the neural voice is off", async () => {
    process.env.GLINT_TTS_MOCK = "1";
    try {
      const encoder = new TextEncoder();
      let output: ReadableStreamDefaultController<Uint8Array>;
      const transport = new ReadableStream<Uint8Array>({
        start(controller) {
          output = controller;
        },
      });
      const agent = new AgentProvider(
        (async () =>
          new Response(transport, {
            headers: { "content-type": "text/event-stream" },
          })) as typeof fetch,
      );
      const f = await fixture(undefined, agent);
      const view = (await (
        await f.call("key", { key: "TEST_ONLY_KEY" })
      ).json()) as View;
      const response = await f.call("agent/stream", {
        question: "Hello",
        model: "muse-spark-test",
        epoch: view.epoch,
        requestId: randomUUID(),
      });
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      output!.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Hi. " }] }] } })}\n\n`,
        ),
      );
      output!.close();
      let sse = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        sse += decoder.decode(part.value);
      }
      expect(sse).not.toContain('"type":"voice"');
      expect(sse).not.toContain('"type":"audio"');
      expect(sse).not.toContain('"type":"voice-done"');
      expect(sse).toContain('"type":"done"');
    } finally {
      delete process.env.GLINT_TTS_MOCK;
    }
  });
  it("carries conversation history across turns in one session", async () => {
    const seen: number[] = [];
    const agent = new AgentProvider(((url: string, init: { body?: string }) => {
      if (url.endsWith("/models"))
        return Promise.resolve(
          Response.json({ data: [{ id: "muse-spark-test" }] }),
        );
      const input = JSON.parse(String(init.body)).input as unknown[];
      const history = input.length - 1;
      seen.push(history);
      const text = `history:${history}`;
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    }) as typeof fetch);
    const f = await fixture(undefined, agent);
    const view = (await (
      await f.call("key", { key: "TEST_ONLY_KEY" })
    ).json()) as View;
    const ask = async (question: string) => {
      const response = await f.call("agent/stream", {
        question,
        model: "muse-spark-test",
        epoch: view.epoch,
        requestId: randomUUID(),
      });
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let sse = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        sse += decoder.decode(part.value);
      }
      return sse;
    };
    const first = await ask("My pet is a cat.");
    const second = await ask("What is my pet?");
    expect(first).toContain("history:0");
    expect(second).toContain("history:2");
    expect(seen).toEqual([0, 2]);
  });
  it("sets a private no-store, HttpOnly, SameSite session cookie; rejects missing session/origin/CSRF", async () => {
    const f = await fixture();
    expect(f.headers.get("cache-control")).toBe("no-store");
    expect(f.headers.get("set-cookie")).toContain("HttpOnly");
    expect(f.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect((await f.call("demo", {}, { cookie: "" })).status).toBe(401);
    expect(
      (await f.call("demo", {}, { origin: "https://foreign.example" })).status,
    ).toBe(403);
    expect((await f.call("demo", {}, { csrf: "forged" })).status).toBe(403);
  });
  it("does not return another session task or accept its CSRF token", async () => {
    const f = await fixture();
    const a = await f.call("demo");
    expect(a.status).toBe(200);
    const r = await fetch(f.base + "/api/session");
    const other = (await r.json()) as View;
    expect(other.task).toBeNull();
    expect(
      (
        await f.call(
          "demo",
          {},
          { cookie: r.headers.get("set-cookie")!.split(";")[0] },
        )
      ).status,
    ).toBe(403);
  });
  it("validates source, blocks replay on a custom task, and rejects remote/oversized images", async () => {
    const f = await fixture();
    expect((await f.call("task", { title: "incomplete" })).status).toBe(400);
    let v = (await (await f.call("demo")).json()) as View;
    v = (await (
      await f.call("confirm", { revision: v.task!.revision })
    ).json()) as View;
    v = (await (await f.call("phase", { phase: "active" })).json()) as View;
    const body = {
      mode: "live",
      question: "Check",
      model: "muse-spark-test",
      revision: v.task!.revision,
      epoch: v.epoch,
      capturedAt: Date.now(),
      requestId: randomUUID(),
    };
    expect(
      (await f.call("check", { ...body, image: "https://localhost/private" }))
        .status,
    ).toBe(400);
    expect(
      (await f.call("check", { ...body, image: "x".repeat(1100000) })).status,
    ).toBe(413);
  });
  it("sanitizes unhandled validation failures and never returns a key in session view", async () => {
    const f = await fixture({
      models: async () => {
        throw Error("secret TEST_ONLY_KEY");
      },
      infer: async () => {
        throw Error();
      },
    });
    const r = await f.call("key", { key: "TEST_ONLY_KEY" });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("TEST_ONLY_KEY");
    const current = await (
      await fetch(f.base + "/api/session", { headers: { Cookie: f.cookie } })
    ).text();
    expect(current).not.toContain("TEST_ONLY_KEY");
  });
});
