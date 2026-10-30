import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Engine } from "../server/engine.ts";
import { Store } from "../server/store.ts";
import type { Provider } from "../server/provider.ts";
import { handleVoiceSocket, type VoiceSocket } from "../server/app.ts";

const providers: Provider = {
  models: async () => ["muse-spark-test"],
  infer: async () => {
    throw new Error("not used");
  },
};
const engines: Engine[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.close());
});

class FakeClient implements VoiceSocket {
  sent: unknown[] = [];
  closed?: { code?: number; reason?: string };
  private handlers = new Map<string, (...args: never[]) => void>();
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  on(event: "message" | "close", cb: (...args: never[]) => void) {
    this.handlers.set(event, cb);
  }
  receive(data: unknown) {
    this.handlers.get("message")!(data as never);
  }
  disconnect() {
    this.handlers.get("close")!();
  }
}

class FakeProvider {
  sent: (string | Uint8Array)[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string | Uint8Array }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send(d: string | Uint8Array) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
  binary() {
    return this.sent.filter((x) => x instanceof Uint8Array) as Uint8Array[];
  }
}

function setup() {
  const sockets: FakeProvider[] = [];
  const engine = new Engine(new Store(":memory:"), providers, Date.now, undefined, {
    socket: () => {
      const s = new FakeProvider();
      sockets.push(s);
      return s;
    },
    sleep: () => Promise.resolve(),
    rand: () => 0,
  });
  engines.push(engine);
  const { session } = engine.session();
  const client = new FakeClient();
  handleVoiceSocket(client, session, engine);
  const ack = (i = 0) => {
    sockets[i].onopen!();
    sockets[i].onmessage!({ data: JSON.stringify({ sessionId: "srv" }) });
  };
  return { engine, session, client, sockets, ack };
}

describe("/voice-stream transport", () => {
  it("opens a stream, forwards audio and transcripts, ends cleanly", async () => {
    const t = setup();
    await t.engine.connect(t.session, "TEST_ONLY_KEY");
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    expect(t.client.sent).toEqual([{ type: "opened" }]);
    t.ack();
    t.client.receive(Buffer.from([7, 7]));
    expect(t.sockets[0].binary()).toHaveLength(1);
    t.sockets[0].onmessage!({
      data: JSON.stringify({ type: "transcript", transcript: "salt?" }),
    });
    t.sockets[0].onmessage!({
      data: JSON.stringify({
        type: "transcript",
        transcript: "salt?",
        final: true,
      }),
    });
    expect(t.client.sent).toEqual([
      { type: "opened" },
      { type: "partial", text: "salt?" },
      { type: "final", transcript: "salt?" },
    ]);
    expect(t.session.calls).toBe(1);
    t.client.receive(JSON.stringify({ type: "end" }));
    expect(JSON.parse(t.sockets[0].sent.at(-1) as string)).toEqual({
      type: "endStream",
    });
    t.sockets[0].onclose!({ code: 1000, reason: "" });
    expect(t.client.sent.at(-1)).toEqual({
      type: "closed",
      code: 1000,
      retryable: false,
    });
  });
  it("rejects opens without a key, with a stale epoch, or on a busy lane", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const t = setup();
      const open = (epoch: number) =>
        t.client.receive(
          JSON.stringify({ type: "open", requestId: randomUUID(), epoch }),
        );
      open(t.session.epoch);
      expect(t.client.sent).toEqual([
        {
          type: "error",
          code: "KEY_REQUIRED",
          message: expect.any(String),
        },
      ]);
      expect(t.client.closed).toBeUndefined();
      await t.engine.connect(t.session, "TEST_ONLY_KEY");
      open(99);
      expect(t.client.sent.at(-1)).toMatchObject({
        type: "error",
        code: "CANCELED",
      });
      open(t.session.epoch);
      expect(t.client.sent.at(-1)).toEqual({ type: "opened" });
      open(t.session.epoch);
      expect(t.client.sent.at(-1)).toMatchObject({
        type: "error",
        code: "BUSY",
      });
      expect(
        warn.mock.calls
          .map((call) => String(call[0]))
          .some((line) => line.includes("KEY_REQUIRED")),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
  it("rejects oversized frames, malformed control, and end without a stream", async () => {
    const t = setup();
    await t.engine.connect(t.session, "TEST_ONLY_KEY");
    t.client.receive(JSON.stringify({ type: "end" }));
    expect(t.client.sent.at(-1)).toMatchObject({
      type: "error",
      code: "CANCELED",
    });
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    t.ack();
    t.client.receive(new Uint8Array(200000));
    expect(t.client.sent.at(-1)).toMatchObject({
      type: "error",
      code: "AUDIO_INVALID",
    });
    t.client.receive("{oops");
    expect(t.client.sent.at(-1)).toMatchObject({ type: "error" });
    t.client.receive(JSON.stringify({ type: "nope" }));
    expect(t.client.sent.at(-1)).toMatchObject({
      type: "error",
      code: "INVALID_INPUT",
    });
  });
  it("reuses one socket across turns and closes the lane explicitly", async () => {
    const t = setup();
    await t.engine.connect(t.session, "TEST_ONLY_KEY");
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    t.ack();
    t.client.receive(JSON.stringify({ type: "close" }));
    expect(t.sockets[0].closed).toBe(true);
    expect(t.client.sent.at(-1)).toEqual({
      type: "closed",
      code: 1000,
      retryable: false,
    });
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    expect(t.client.sent.at(-1)).toEqual({ type: "opened" });
    expect(t.sockets).toHaveLength(2);
  });
  it("tears down the stream when the browser disconnects", async () => {
    const t = setup();
    await t.engine.connect(t.session, "TEST_ONLY_KEY");
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    t.ack();
    t.client.disconnect();
    expect(t.sockets[0].closed).toBe(true);
  });
  it("reports provider errors and gaps without dropping the socket", async () => {
    const t = setup();
    await t.engine.connect(t.session, "TEST_ONLY_KEY");
    t.client.receive(
      JSON.stringify({ type: "open", requestId: randomUUID(), epoch: t.session.epoch }),
    );
    t.client.receive(new Uint8Array(60000).fill(1));
    t.client.receive(new Uint8Array(60000).fill(2));
    t.client.receive(new Uint8Array(60000).fill(3));
    t.ack();
    t.sockets[0].onmessage!({
      data: JSON.stringify({ type: "error", message: "boom" }),
    });
    expect(t.client.sent).toContainEqual({ type: "gap" });
    expect(t.client.sent).toContainEqual({
      type: "error",
      code: "ASR_ERROR",
      message: "boom",
    });
    expect(t.client.closed).toBeUndefined();
  });
});
