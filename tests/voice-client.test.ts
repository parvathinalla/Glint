import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StreamTurns,
  VoiceClient,
  isStreamingVoiceEnabled,
  type VoiceClientEvents,
  type VoiceClientSocket,
} from "../src/voice-stream.ts";

class FakeSocket implements VoiceClientSocket {
  sent: (string | Uint8Array)[] = [];
  closed = false;
  private handlers = new Map<string, (arg?: unknown) => void>();
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  onOpen(cb: () => void) {
    this.handlers.set("open", cb);
  }
  onMessage(cb: (data: unknown) => void) {
    this.handlers.set("message", cb as (arg?: unknown) => void);
  }
  onClose(cb: (code: number) => void) {
    this.handlers.set("close", cb as (arg?: unknown) => void);
  }
  open() {
    this.handlers.get("open")!();
  }
  serverSend(data: unknown) {
    this.handlers.get("message")!(data);
  }
  serverClose(code = 1000) {
    this.handlers.get("close")!(code);
  }
  json() {
    return this.sent
      .filter((x) => typeof x === "string")
      .map((x) => JSON.parse(x));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const handler: VoiceClientEvents = {
    onOpened: () => events.push("opened"),
    onPartial: (t) => events.push(`partial:${t}`),
    onTurn: (id, t) => events.push(`turn:${id}:${t}`),
    onFinal: (t) => events.push(`final:${t}`),
    onGap: () => events.push("gap"),
    onClosed: (info) =>
      events.push(`closed:${info.code}:${info.retryable}:${info.reason ?? ""}`),
    onError: (code, message) => events.push(`error:${code}:${message}`),
  };
  const client = new VoiceClient("ws://test/voice-stream", handler, () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  return { client, sockets, events };
}

describe("streaming voice client", () => {
  it("queues outbound frames until the socket opens, then flushes in order", () => {
    const t = setup();
    t.client.connect();
    t.client.open(3, "id-1");
    t.client.audio(new Uint8Array([1, 2]));
    expect(t.sockets[0].sent).toHaveLength(0);
    t.sockets[0].open();
    expect(t.sockets[0].json()[0]).toEqual({
      type: "open",
      epoch: 3,
      requestId: "id-1",
    });
    expect(t.sockets[0].sent).toHaveLength(1);
    t.sockets[0].serverSend(JSON.stringify({ type: "opened" }));
    expect(t.sockets[0].sent[1]).toBeInstanceOf(Uint8Array);
    t.client.end();
    expect(t.sockets[0].json().at(-1)).toEqual({ type: "end" });
    t.client.closeStream();
    expect(t.sockets[0].json().at(-1)).toEqual({ type: "close" });
  });
  it("holds turn audio until opened and drops stale audio on end", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    t.client.open(1, "a");
    t.client.audio(new Uint8Array([9]));
    t.client.end();
    t.client.open(2, "b");
    t.sockets[0].serverSend(JSON.stringify({ type: "opened" }));
    expect(
      t.sockets[0].sent.filter((x) => x instanceof Uint8Array),
    ).toHaveLength(0);
  });
  it("caps pre-open buffering to the latest audio", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    t.client.open(1, "a");
    t.client.audio(new Uint8Array(100000).fill(1));
    t.client.audio(new Uint8Array(100000).fill(2));
    t.sockets[0].serverSend(JSON.stringify({ type: "opened" }));
    const binary = t.sockets[0].sent.filter(
      (x) => x instanceof Uint8Array,
    ) as Uint8Array[];
    expect(binary).toHaveLength(1);
    expect(binary[0][0]).toBe(2);
  });
  it("generates a request id when the caller passes none", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    t.client.open(0);
    expect(t.sockets[0].json()[0].requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
  it("routes every server event to its handler", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    for (const frame of [
      { type: "opened" },
      { type: "partial", text: "salt" },
      { type: "turn", turnId: 2, transcript: "salt?" },
      { type: "final", transcript: "salt?" },
      { type: "gap" },
      { type: "error", code: "ASR_ERROR", message: "boom" },
      { type: "closed", code: 1000, retryable: false },
    ])
      t.sockets[0].serverSend(JSON.stringify(frame));
    expect(t.events).toEqual([
      "opened",
      "partial:salt",
      "turn:2:salt?",
      "final:salt?",
      "gap",
      "error:ASR_ERROR:boom",
      "closed:1000:false:",
    ]);
  });
  it("reports malformed server frames instead of crashing", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    t.sockets[0].serverSend("{oops");
    t.sockets[0].serverSend(JSON.stringify({ type: "nope" }));
    t.sockets[0].serverSend(JSON.stringify({ type: "partial" }));
    t.sockets[0].serverSend(123);
    expect(t.events).toHaveLength(4);
    expect(t.events.every((e) => e.startsWith("error:PROTOCOL:"))).toBe(true);
  });
  it("reports the socket close once and drops later sends", () => {
    const t = setup();
    t.client.connect();
    t.sockets[0].open();
    t.client.open(0, "id-1");
    t.sockets[0].serverClose(1001);
    expect(t.events).toEqual(["closed:1001:false:"]);
    t.client.audio(new Uint8Array([1]));
    t.client.open(0, "id-2");
    expect(t.sockets[0].sent).toHaveLength(1);
    t.sockets[0].serverClose(1001);
    expect(t.events).toHaveLength(1);
  });
  it("throws when sending before connect and stays silent after dispose", () => {
    const t = setup();
    expect(() => t.client.open(0, "id-1")).toThrow();
    t.client.connect();
    t.sockets[0].open();
    t.client.dispose();
    expect(t.sockets[0].closed).toBe(true);
    t.client.audio(new Uint8Array([1]));
    expect(t.sockets[0].sent).toHaveLength(0);
    t.sockets[0].serverClose(1000);
    t.sockets[0].serverSend(JSON.stringify({ type: "partial", text: "x" }));
    expect(t.events).toEqual([]);
  });
  it("refuses a second connect on one client", () => {
    const t = setup();
    t.client.connect();
    expect(() => t.client.connect()).toThrow();
  });
});

describe("stream turn bookkeeping", () => {
  const wav = (n: string) => new Blob([n], { type: "audio/wav" });
  it("answers each turn once on the streamed final", () => {
    const turns = new StreamTurns();
    expect(turns.started()).toBeNull();
    expect(turns.shouldEnd()).toBe(true);
    expect(turns.finalArrived()).toBe(true);
    expect(turns.finalArrived()).toBe(false);
    expect(turns.streamFailed()).toBeNull();
    expect(turns.wavReady(wav("a"))).toBe("drop");
    expect(turns.shouldEnd()).toBe(false);
  });
  it("falls back to the WAV when the stream fails mid-turn", () => {
    const turns = new StreamTurns();
    turns.started();
    expect(turns.streamFailed()).toBeNull();
    expect(turns.shouldEnd()).toBe(false);
    expect(turns.finalArrived()).toBe(false);
    expect(turns.wavReady(wav("a"))).toBe("fallback");
  });
  it("falls back immediately when the stream fails after the turn ended", () => {
    const turns = new StreamTurns();
    turns.started();
    const audio = wav("a");
    expect(turns.wavReady(audio)).toBe("store");
    expect(turns.streamFailed()).toBe(audio);
  });
  it("flushes an unsettled turn when the next starts", () => {
    const turns = new StreamTurns();
    turns.started();
    const audio = wav("a");
    turns.wavReady(audio);
    expect(turns.started()).toBe(audio);
    expect(turns.finalArrived()).toBe(true);
    expect(turns.wavReady(wav("b"))).toBe("drop");
  });
  it("starts clean when the previous turn settled or never produced audio", () => {
    const turns = new StreamTurns();
    turns.started();
    turns.finalArrived();
    expect(turns.started()).toBeNull();
    turns.reset();
    turns.started();
    expect(turns.streamFailed()).toBeNull();
    expect(turns.started()).toBeNull();
  });
});

describe("streaming kill switch", () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = (value: string | null) => ({
    getItem: (key: string) =>
      key === "glint-streaming-voice" ? value : null,
  });
  it("streams by default and when the flag holds any other value", () => {
    expect(isStreamingVoiceEnabled()).toBe(true);
    vi.stubGlobal("localStorage", storage("1"));
    expect(isStreamingVoiceEnabled()).toBe(true);
  });
  it("falls back to WAV voice when the flag is 0 or unreadable", () => {
    vi.stubGlobal("localStorage", storage("0"));
    expect(isStreamingVoiceEnabled()).toBe(false);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(isStreamingVoiceEnabled()).toBe(true);
  });
});
