import { z } from "zod";
import { WebSocket } from "ws";
import { Problem } from "./provider.ts";

/**
 * Muse Voice Transcribe realtime client. Provider contract verified from
 * official Meta docs; see docs/SPIKE.md B1. Reconnect schedule, reconnect
 * budget, and gap buffering come from the design doc: backoff 250/500ms,
 * 1/2s, then 5s max with jitter for up to 60s total; at most 3s of audio
 * buffered across a gap, sent only within the current epoch.
 */
export const ASR_REALTIME_URL = "wss://api.meta.ai/v1/asr/realtime";
export const ASR_MODEL = "muse-voice-transcribe-1.0";
export const RECONNECT_BUDGET_MS = 60000;
export const GAP_BUFFER_MS = 3000;
export type AsrMode = "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION";
export type AsrEncoding = "PCM_24KHZ" | "PCM_16KHZ";
export type AsrState = "connecting" | "ready" | "ending" | "closed";

export type AsrSocket = {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | Uint8Array }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
export type AsrSocketFactory = (url: string) => AsrSocket;

/** Production socket factory over the ws package. */
export function wsSocket(url: string): AsrSocket {
  const socket = new WebSocket(url);
  const adapted: AsrSocket = {
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.on("open", () => adapted.onopen?.());
  socket.on("message", (data: WebSocket.RawData) => {
    if (typeof data === "string") adapted.onmessage?.({ data });
    else if (data instanceof Buffer)
      adapted.onmessage?.({
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      });
    else if (data instanceof ArrayBuffer)
      adapted.onmessage?.({ data: new Uint8Array(data) });
    else if (Array.isArray(data))
      adapted.onmessage?.({ data: new Uint8Array(Buffer.concat(data)) });
  });
  socket.on("close", (code: number, reason: Buffer) =>
    adapted.onclose?.({ code, reason: reason.toString() }),
  );
  socket.on("error", (error: unknown) => adapted.onerror?.(error));
  return adapted;
}

export type AsrEvents = {
  /** Fired once when the handshake ack arrives and audio may flow. */
  onReady?: () => void;
  /** Interim hypothesis. CUMULATIVE: replaces the previous partial. */
  onPartial?: (text: string) => void;
  /** ENDPOINTING/DIARIZATION turn completion for one turnId. */
  onTurn?: (turnId: number, transcript: string) => void;
  /** PUSH_TO_TALK completion (transcript event with final:true). */
  onFinal?: (transcript: string) => void;
  /** Server error event; the connection still closes on its own. */
  onError?: (message: string) => void;
  /** Terminal close. Only 1013 (rate-limited) is retryable. */
  onClosed?: (info: { code: number; retryable: boolean }) => void;
};

export type RealtimeOptions = {
  mode?: AsrMode;
  audioEncoding?: AsrEncoding;
  sessionId?: string;
  socket?: AsrSocketFactory;
};

const transcriptEvent = z.object({
  type: z.literal("transcript"),
  transcript: z.string(),
  final: z.boolean().optional(),
});
const speechStartEvent = z.object({
  type: z.literal("speechStart"),
  turnId: z.number().int().optional(),
});
const speechCompleteEvent = z.object({
  type: z.literal("speechComplete"),
  turnId: z.number().int().optional(),
  transcript: z.string().optional(),
});
const errorEvent = z.object({ type: z.literal("error"), message: z.string() });

export class RealtimeSession {
  private socket: AsrSocket | null = null;
  private acknowledged = false;
  private turnText = "";
  private turnId = 0;
  private _state: AsrState = "connecting";
  private _serverSessionId?: string;
  private _partial = "";
  constructor(
    private key: string,
    private events: AsrEvents = {},
    private options: RealtimeOptions = {},
  ) {}
  get state(): AsrState {
    return this._state;
  }
  get serverSessionId(): string | undefined {
    return this._serverSessionId;
  }
  get currentPartial(): string {
    return this._partial;
  }
  connect() {
    if (this.socket)
      throw new Problem(
        409,
        "ASR_STATE",
        "The realtime session is already open.",
      );
    const factory = this.options.socket ?? wsSocket;
    const url = this.options.sessionId
      ? `${ASR_REALTIME_URL}?sessionId=${encodeURIComponent(this.options.sessionId)}`
      : ASR_REALTIME_URL;
    const socket = factory(url);
    this.socket = socket;
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          authorization: { accessToken: `Bearer ${this.key}` },
          model: ASR_MODEL,
          mode: this.options.mode ?? "ENDPOINTING",
          audioEncoding: this.options.audioEncoding ?? "PCM_24KHZ",
        }),
      );
    };
    socket.onmessage = (event) => this.onFrame(event.data);
    socket.onclose = (event) => {
      if (this._state === "closed") return;
      this._state = "closed";
      this.events.onClosed?.({
        code: event.code,
        retryable: event.code === 1013,
      });
    };
    socket.onerror = () => {};
  }
  sendAudio(pcm: Uint8Array) {
    if (this._state !== "ready" || !this.socket)
      throw new Problem(
        409,
        "ASR_STATE",
        "The realtime session is not ready for audio.",
      );
    this.socket.send(pcm);
  }
  endStream() {
    if (this._state !== "ready" || !this.socket)
      throw new Problem(
        409,
        "ASR_STATE",
        "The realtime session cannot end input now.",
      );
    this._state = "ending";
    this.socket.send(JSON.stringify({ type: "endStream" }));
  }
  close() {
    if (this._state === "closed") return;
    this._state = "closed";
    this.socket?.close(1000, "Client done");
    this.socket = null;
  }
  private fail() {
    this._state = "closed";
    this.socket?.close(1002, "Unexpected server frame");
    this.events.onClosed?.({ code: 1002, retryable: false });
  }
  private onFrame(data: string | Uint8Array) {
    if (this._state === "closed") return;
    const text =
      typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    if (!this.acknowledged) {
      if (
        typeof raw === "object" &&
        raw !== null &&
        !("type" in raw) &&
        typeof (raw as { sessionId?: unknown }).sessionId === "string"
      ) {
        this.acknowledged = true;
        this._serverSessionId = (raw as { sessionId: string }).sessionId;
        this._state = "ready";
        this.events.onReady?.();
      } else this.fail();
      return;
    }
    if (typeof raw !== "object" || raw === null) return;
    const type = (raw as { type?: unknown }).type;
    if (type === "transcript") {
      const parsed = transcriptEvent.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.final) this.events.onFinal?.(parsed.data.transcript);
      else {
        this._partial = parsed.data.transcript;
        this.turnText = parsed.data.transcript;
        this.events.onPartial?.(parsed.data.transcript);
      }
    } else if (type === "speechStart") {
      const parsed = speechStartEvent.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.turnId !== undefined) this.turnId = parsed.data.turnId;
      this.turnText = "";
    } else if (type === "speechComplete") {
      const parsed = speechCompleteEvent.safeParse(raw);
      if (!parsed.success) return;
      this.events.onTurn?.(
        parsed.data.turnId ?? this.turnId,
        parsed.data.transcript ?? this.turnText,
      );
      this.turnText = "";
    } else if (type === "error") {
      const parsed = errorEvent.safeParse(raw);
      if (parsed.success) this.events.onError?.(parsed.data.message);
    }
    // audioProgress and unknown future types are intentionally ignored.
  }
}

export type VoiceClosedInfo = {
  code: number;
  retryable: boolean;
  reason?: string;
};

export type VoiceEvents = {
  onPartial: (text: string) => void;
  onTurn: (turnId: number, transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError: (message: string) => void;
  onClosed: (info: VoiceClosedInfo) => void;
  /** Buffered audio was shed, or stale-epoch audio was dropped. */
  onGap: () => void;
  /** False once the owning session moved on; stale audio is dropped. */
  isCurrent: () => boolean;
  /** Charge one call for a finalized turn; false pauses the stream. */
  chargeTurn: () => boolean;
};

export type VoiceStreamOptions = {
  socket?: AsrSocketFactory;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  rand?: () => number;
};

/** PCM 24 kHz mono 16-bit runs 48,000 bytes/s; the gap buffer holds 3 s. */
export const GAP_BUFFER_BYTES = GAP_BUFFER_MS * 48;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One voice turn over the realtime endpoint. Buffers audio across the
 * handshake and 1013 reconnects, finalizes exactly one turn, and charges
 * it through the owner before reporting it. A new provider socket is a
 * new provider session (docs/SPIKE.md B1: no resume token); transcripts
 * join app-side because partials always replace. The app layer opens a
 * fresh stream per turn.
 */
export class VoiceStream {
  private session: RealtimeSession | null = null;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private started = false;
  private closed = false;
  private endRequested = false;
  private finalized = false;
  private attempt = 0;
  private firstDisconnectAt: number | undefined;
  constructor(
    private key: string,
    private events: VoiceEvents,
    private options: VoiceStreamOptions = {},
  ) {}
  open() {
    if (this.started)
      throw new Problem(
        409,
        "ASR_STATE",
        "The voice stream is already open.",
      );
    this.started = true;
    this.connectSession();
  }
  /** Client PCM; dropped after end/close, gap-marked when stale or shed. */
  audio(pcm: Uint8Array) {
    if (this.closed || this.endRequested) return;
    if (!this.events.isCurrent()) {
      this.events.onGap();
      return;
    }
    if (this.session?.state === "ready") {
      this.session.sendAudio(pcm);
      return;
    }
    this.pending.push(pcm);
    this.pendingBytes += pcm.byteLength;
    if (this.pendingBytes > GAP_BUFFER_BYTES) {
      while (this.pending.length > 0 && this.pendingBytes > GAP_BUFFER_BYTES)
        this.pendingBytes -= this.pending.shift()!.byteLength;
      this.events.onGap();
    }
  }
  end() {
    if (this.closed) return;
    this.endRequested = true;
    if (this.session?.state === "ready") this.session.endStream();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.session?.close();
    this.session = null;
    this.pending = [];
    this.pendingBytes = 0;
  }
  private connectSession() {
    const session = new RealtimeSession(
      this.key,
      {
        onReady: () => {
          if (this.closed) return;
          for (const chunk of this.pending) session.sendAudio(chunk);
          this.pending = [];
          this.pendingBytes = 0;
          if (this.endRequested && session.state === "ready")
            session.endStream();
        },
        onPartial: (text) => {
          if (!this.closed && this.events.isCurrent())
            this.events.onPartial(text);
        },
        onTurn: (id, text) => this.finalize(() => this.events.onTurn(id, text)),
        onFinal: (text) => this.finalize(() => this.events.onFinal(text)),
        onError: (message) => {
          if (!this.closed) this.events.onError(message);
        },
        onClosed: (info) => this.onProviderClosed(info),
      },
      { socket: this.options.socket },
    );
    this.session = session;
    session.connect();
  }
  /** First finalize signal wins; the turn is charged before it is reported. */
  private finalize(emit: () => void) {
    if (this.closed || this.finalized || !this.events.isCurrent()) return;
    this.finalized = true;
    if (!this.events.chargeTurn()) {
      this.closed = true;
      this.session?.close();
      this.session = null;
      this.events.onClosed({
        code: 1000,
        retryable: false,
        reason: "allowance-exhausted",
      });
      return;
    }
    emit();
  }
  private onProviderClosed(info: { code: number; retryable: boolean }) {
    if (this.closed) return;
    const terminal = (reason?: string) => {
      this.closed = true;
      this.session = null;
      this.events.onClosed({ code: info.code, retryable: false, reason });
    };
    if (!info.retryable || this.endRequested || this.finalized) {
      terminal();
      return;
    }
    const now = (this.options.now ?? Date.now)();
    if (this.firstDisconnectAt === undefined) this.firstDisconnectAt = now;
    else if (now - this.firstDisconnectAt >= RECONNECT_BUDGET_MS) {
      terminal("reconnect-budget-exhausted");
      return;
    }
    const delay = backoffMs(this.attempt++, this.options.rand ?? Math.random);
    const sleep = this.options.sleep ?? defaultSleep;
    void (async () => {
      try {
        await sleep(delay);
      } catch {
        if (!this.closed) terminal("reconnect-failed");
        return;
      }
      if (this.closed || !this.events.isCurrent()) return;
      try {
        this.connectSession();
      } catch {
        terminal("reconnect-failed");
      }
    })();
  }
}

/**
 * Reconnect delay for attempt n (0-based): 250/500ms, 1s, 2s, then 5s,
 * with equal jitter (half the base plus up to half). Inject rand in tests.
 */
export function backoffMs(
  attempt: number,
  rand: () => number = Math.random,
): number {
  const base = attempt <= 3 ? 250 * 2 ** Math.max(0, attempt) : 5000;
  return Math.floor(base / 2 + rand() * (base / 2));
}
