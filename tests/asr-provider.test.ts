import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import {
  backoffMs,
  RealtimeSession,
  VoiceStream,
  wsSocket,
  type AsrEvents,
  type AsrSocket,
} from "../server/asr-provider.ts";

class FakeSocket implements AsrSocket {
  sent: (string | Uint8Array)[] = [];
  closed?: { code?: number; reason?: string };
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | Uint8Array }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  serverSend(text: string) {
    this.onmessage?.({ data: text });
  }
  serverClose(code: number, reason = "") {
    this.onclose?.({ code, reason });
  }
}

function setup(events: AsrEvents = {}, sessionId = "test-session") {
  let url = "";
  const socket = new FakeSocket();
  const session = new RealtimeSession("test-key", events, {
    sessionId,
    socket: (u: string) => {
      url = u;
      return socket;
    },
  });
  return { session, socket, url: () => url };
}

describe("realtime ASR session", () => {
  it("opens the verified endpoint and handshakes with auth in the frame", () => {
    const { session, socket, url } = setup();
    session.connect();
    socket.onopen!();
    expect(url()).toBe(
      "wss://api.meta.ai/v1/asr/realtime?sessionId=test-session",
    );
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] as string)).toMatchObject({
      authorization: { accessToken: "Bearer test-key" },
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      audioEncoding: "PCM_24KHZ",
    });
    expect(session.state).toBe("connecting");
  });
  it("becomes ready on the typeless handshake acknowledgement", () => {
    const { session, socket } = setup();
    session.connect();
    socket.onopen!();
    expect(() => session.sendAudio(new Uint8Array([1, 2]))).toThrow();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    expect(session.state).toBe("ready");
    expect(session.serverSessionId).toBe("srv-1");
    session.sendAudio(new Uint8Array([1, 2]));
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toBeInstanceOf(Uint8Array);
  });
  it("rejects a first frame that carries a type", () => {
    const closed: { code: number; retryable: boolean }[] = [];
    const { session, socket } = setup({ onClosed: (info) => closed.push(info) });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ type: "transcript", transcript: "x" }));
    expect(session.state).toBe("closed");
    expect(closed).toEqual([{ code: 1002, retryable: false }]);
    expect(socket.closed?.code).toBe(1002);
  });
  it("treats partials as replacements, never appends", () => {
    const partials: string[] = [];
    const { session, socket } = setup({
      onPartial: (text) => partials.push(text),
    });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "hello" }),
    );
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "hello there" }),
    );
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "goodbye" }),
    );
    expect(partials).toEqual(["hello", "hello there", "goodbye"]);
    expect(session.currentPartial).toBe("goodbye");
  });
  it("finalizes push-to-talk turns on final:true", () => {
    const finals: string[] = [];
    const { session, socket } = setup({ onFinal: (t) => finals.push(t) });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "go", final: true }),
    );
    expect(finals).toEqual(["go"]);
  });
  it("finalizes endpointing turns on speechComplete with its transcript", () => {
    const turns: [number, string][] = [];
    const { session, socket } = setup({
      onTurn: (id, text) => turns.push([id, text]),
    });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(JSON.stringify({ type: "speechStart", turnId: 4 }));
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "salt added" }),
    );
    socket.serverSend(
      JSON.stringify({ type: "speechComplete", turnId: 4, transcript: "salt added?" }),
    );
    expect(turns).toEqual([[4, "salt added?"]]);
  });
  it("falls back to the last partial when speechComplete carries no transcript", () => {
    const turns: [number, string][] = [];
    const { session, socket } = setup({
      onTurn: (id, text) => turns.push([id, text]),
    });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(JSON.stringify({ type: "speechStart" }));
    socket.serverSend(
      JSON.stringify({ type: "transcript", transcript: "stir now" }),
    );
    socket.serverSend(JSON.stringify({ type: "speechComplete" }));
    expect(turns).toEqual([[0, "stir now"]]);
  });
  it("ignores progress and unknown events without failing", () => {
    const partials: string[] = [];
    const { session, socket } = setup({
      onPartial: (text) => partials.push(text),
    });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(
      JSON.stringify({ type: "audioProgress", audioProcessedMs: 1200 }),
    );
    socket.serverSend(JSON.stringify({ type: "something-new", x: 1 }));
    socket.serverSend("not json at all");
    expect(partials).toEqual([]);
    expect(session.state).toBe("ready");
  });
  it("surfaces error events without closing the session itself", () => {
    const errors: string[] = [];
    const { session, socket } = setup({ onError: (m) => errors.push(m) });
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    socket.serverSend(
      JSON.stringify({ type: "error", message: "boom", sessionId: "srv-1" }),
    );
    expect(errors).toEqual(["boom"]);
    expect(session.state).toBe("ready");
    expect(socket.closed).toBeUndefined();
  });
  it("ends input with endStream and refuses further audio", () => {
    const { session, socket } = setup();
    session.connect();
    socket.onopen!();
    socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
    session.endStream();
    expect(session.state).toBe("ending");
    expect(JSON.parse(socket.sent.at(-1) as string)).toEqual({
      type: "endStream",
    });
    expect(() => session.sendAudio(new Uint8Array([1]))).toThrow();
  });
  it("maps close codes to retry decisions", () => {
    for (const [code, retryable] of [
      [1000, false],
      [1013, true],
      [1008, false],
    ] as const) {
      const closed: { code: number; retryable: boolean }[] = [];
      const { session, socket } = setup({
        onClosed: (info) => closed.push(info),
      });
      session.connect();
      socket.onopen!();
      socket.serverSend(JSON.stringify({ sessionId: "srv-1" }));
      socket.serverClose(code);
      expect(session.state).toBe("closed");
      expect(closed).toEqual([{ code, retryable }]);
    }
  });
});

describe("voice stream lifecycle", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function streamSetup() {
    const sockets: FakeSocket[] = [];
    const sleeps: number[] = [];
    const events: string[] = [];
    let now = 100000;
    let current = true;
    let charged = 0;
    let chargeOk = true;
    const stream = new VoiceStream(
      "test-key",
      {
        onPartial: (t) => events.push(`partial:${t}`),
        onTurn: (id, t) => events.push(`turn:${id}:${t}`),
        onFinal: (t) => events.push(`final:${t}`),
        onError: (m) => events.push(`error:${m}`),
        onClosed: (info) =>
          events.push(`closed:${info.code}:${info.retryable}:${info.reason ?? ""}`),
        onGap: () => events.push("gap"),
        isCurrent: () => current,
        chargeTurn: () => {
          if (!chargeOk) return false;
          charged++;
          return true;
        },
      },
      {
        socket: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
        sleep: (ms: number) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        now: () => now,
        rand: () => 0,
      },
    );
    const ack = (s: FakeSocket) => {
      s.onopen!();
      s.serverSend(JSON.stringify({ sessionId: "srv" }));
    };
    const binary = (s: FakeSocket) =>
      s.sent.filter((x) => x instanceof Uint8Array) as Uint8Array[];
    return {
      stream,
      sockets,
      sleeps,
      events,
      ack,
      binary,
      setNow: (v: number) => (now = v),
      setCurrent: (v: boolean) => (current = v),
      setChargeOk: (v: boolean) => (chargeOk = v),
      charged: () => charged,
    };
  }
  it("buffers audio until ready, then flushes in order", () => {
    const t = streamSetup();
    t.stream.open();
    t.stream.audio(new Uint8Array([1]));
    t.stream.audio(new Uint8Array([2]));
    expect(t.sockets).toHaveLength(1);
    expect(t.binary(t.sockets[0])).toHaveLength(0);
    t.ack(t.sockets[0]);
    expect(t.binary(t.sockets[0]).map((b) => b[0])).toEqual([1, 2]);
    expect(t.events).not.toContain("gap");
  });
  it("reconnects on 1013 with backoff and flushes gap audio", async () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.sockets[0].serverClose(1013);
    await tick();
    await tick();
    expect(t.sleeps).toEqual([125]);
    expect(t.sockets).toHaveLength(2);
    t.stream.audio(new Uint8Array([9]));
    t.ack(t.sockets[1]);
    expect(t.binary(t.sockets[1]).map((b) => b[0])).toEqual([9]);
    expect(t.events).not.toContain("closed:1013:true:");
  });
  it("gives up reconnecting after the 60s budget", async () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.sockets[0].serverClose(1013);
    await tick();
    await tick();
    expect(t.sockets).toHaveLength(2);
    t.setNow(100000 + 61000);
    t.sockets[1].serverClose(1013);
    await tick();
    await tick();
    expect(t.sockets).toHaveLength(2);
    expect(t.events).toContain("closed:1013:false:reconnect-budget-exhausted");
  });
  it("marks recognition context lost when reconnecting after audio was consumed", async () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.stream.audio(new Uint8Array([1, 2]));
    t.sockets[0].serverClose(1013);
    expect(t.events).toContain("gap");
    await tick();
    await tick();
    expect(t.sockets).toHaveLength(2);
  });
  it("drops overflowed gap audio and marks the gap", () => {
    const t = streamSetup();
    t.stream.open();
    t.stream.audio(new Uint8Array(100000).fill(1));
    t.stream.audio(new Uint8Array(100000).fill(2));
    t.ack(t.sockets[0]);
    const flushed = t.binary(t.sockets[0]);
    expect(flushed).toHaveLength(1);
    expect(flushed[0][0]).toBe(2);
    expect(t.events).toContain("gap");
  });
  it("drops stale-epoch audio instead of buffering it", () => {
    const t = streamSetup();
    t.stream.open();
    t.setCurrent(false);
    t.stream.audio(new Uint8Array([1]));
    t.ack(t.sockets[0]);
    expect(t.binary(t.sockets[0])).toHaveLength(0);
    expect(t.events).toContain("gap");
  });
  it("finalizes once even when both turn signals arrive", () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.sockets[0].serverSend(
      JSON.stringify({ type: "transcript", transcript: "go", final: true }),
    );
    t.sockets[0].serverSend(JSON.stringify({ type: "speechComplete", turnId: 1 }));
    expect(t.events).toEqual(["final:go"]);
    expect(t.charged()).toBe(1);
  });
  it("closes with allowance notice when charging fails", () => {
    const t = streamSetup();
    t.setChargeOk(false);
    t.stream.open();
    t.ack(t.sockets[0]);
    t.sockets[0].serverSend(
      JSON.stringify({ type: "transcript", transcript: "go", final: true }),
    );
    expect(t.events).toEqual(["closed:1000:false:allowance-exhausted"]);
    expect(t.charged()).toBe(0);
  });
  it("logs provider close codes for live diagnosis", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const t = streamSetup();
      t.stream.open();
      t.ack(t.sockets[0]);
      t.sockets[0].serverClose(1008);
      expect(
        warn.mock.calls
          .map((call) => String(call[0]))
          .some((line) => line.includes("code=1008")),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
  it("ends input cleanly and reports the normal close", () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.stream.end();
    expect(JSON.parse(t.sockets[0].sent.at(-1) as string)).toEqual({
      type: "endStream",
    });
    t.sockets[0].serverClose(1000);
    expect(t.events).toContain("closed:1000:false:");
  });
  it("defers end until a pending connection is ready", () => {
    const t = streamSetup();
    t.stream.open();
    t.stream.audio(new Uint8Array([1]));
    t.stream.end();
    t.ack(t.sockets[0]);
    expect(t.binary(t.sockets[0]).map((b) => b[0])).toEqual([1]);
    expect(JSON.parse(t.sockets[0].sent.at(-1) as string)).toEqual({
      type: "endStream",
    });
  });
  it("drops audio after input ended", () => {
    const t = streamSetup();
    t.stream.open();
    t.ack(t.sockets[0]);
    t.stream.end();
    t.stream.audio(new Uint8Array([1]));
    expect(t.binary(t.sockets[0])).toHaveLength(0);
  });
});

describe("production socket", () => {
  it("races address families so broken IPv6 cannot sink realtime", () => {
    let seen: unknown;
    class FakeWs {
      constructor(_url: unknown, _protocols: unknown, options: unknown) {
        seen = options;
      }
      on() {}
      send() {}
      close() {}
    }
    wsSocket(
      "wss://api.meta.ai/v1/asr/realtime",
      FakeWs as unknown as typeof WebSocket,
    );
    expect(seen).toMatchObject({ autoSelectFamily: true });
  });
});

describe("reconnect backoff", () => {
  it("follows 250/500/1s/2s then 5s max with bounded jitter", () => {
    expect(backoffMs(0, () => 0)).toBe(125);
    expect(backoffMs(1, () => 0)).toBe(250);
    expect(backoffMs(2, () => 0)).toBe(500);
    expect(backoffMs(3, () => 0)).toBe(1000);
    expect(backoffMs(4, () => 0)).toBe(2500);
    expect(backoffMs(9, () => 0.999999)).toBeLessThanOrEqual(5000);
    expect(backoffMs(9, () => 0.999999)).toBeGreaterThan(2500);
  });
});
