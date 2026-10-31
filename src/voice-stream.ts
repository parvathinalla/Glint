/** Browser client for /voice-stream: control JSON plus binary PCM16 mono. */
export type VoiceClientEvents = {
  onOpened: () => void;
  onPartial: (text: string) => void;
  onTurn: (turnId: number, transcript: string) => void;
  onFinal: (transcript: string) => void;
  onGap: () => void;
  onClosed: (info: {
    code: number;
    retryable: boolean;
    reason?: string;
  }) => void;
  onError: (code: string, message: string) => void;
};
/** Minimal socket surface; the default factory adapts the real WebSocket. */
export type VoiceClientSocket = {
  send(data: string | Uint8Array): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: unknown) => void): void;
  onClose(cb: (code: number) => void): void;
};
const browserSocket = (url: string): VoiceClientSocket => {
  const socket = new WebSocket(url);
  return {
    send: (data) => socket.send(data),
    close: () => socket.close(),
    onOpen: (cb) => {
      socket.onopen = () => cb();
    },
    onMessage: (cb) => {
      socket.onmessage = (event) => cb(event.data);
    },
    onClose: (cb) => {
      socket.onclose = (event) => cb(event.code);
    },
  };
};
/**
 * Streaming kill switch: setting localStorage "glint-streaming-voice" to
 * "0" forces the labeled WAV fallback without a redeploy. Read fresh on
 * every call; anything unreadable means streaming stays on.
 */
export function isStreamingVoiceEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("glint-streaming-voice") !== "0";
  } catch {
    return true;
  }
}
export type StreamWavDecision = "store" | "fallback" | "drop";
/**
 * Exactly-once bookkeeping across streamed turns. A new turn flushes an
 * unsettled previous turn's audio for the labeled fallback; the caller
 * must close the superseded stream before opening the new one, so a late
 * final can never be mistaken for the new turn's.
 */
export class StreamTurns {
  private open = false;
  private failed = false;
  private pending: Blob | null = null;
  /** A non-echo detector turn started. Returns audio the previous turn left behind, if any. */
  started(): Blob | null {
    const flush = this.open ? this.pending : null;
    this.pending = null;
    this.open = true;
    this.failed = false;
    return flush;
  }
  /** Detector turn audio completed: store it, send it as fallback, or drop it. */
  wavReady(wav: Blob): StreamWavDecision {
    if (this.failed) {
      this.failed = false;
      return "fallback";
    }
    if (!this.open) return "drop";
    this.pending = wav;
    return "store";
  }
  /** A final transcript arrived. False when the turn already settled. */
  finalArrived(): boolean {
    if (!this.open) return false;
    this.open = false;
    this.pending = null;
    return true;
  }
  /** The open stream failed. Returns audio to answer now, if the turn ended. */
  streamFailed(): Blob | null {
    if (!this.open) return null;
    this.open = false;
    const wav = this.pending;
    this.pending = null;
    this.failed = wav === null;
    return wav;
  }
  /** Whether turn end should send endStream (lane still open for this turn). */
  shouldEnd(): boolean {
    return this.open;
  }
  reset() {
    this.open = false;
    this.failed = false;
    this.pending = null;
  }
}
const MAX_PREOPEN_BYTES = 144000;
export class VoiceClient {
  private socket: VoiceClientSocket | null = null;
  private queue: (string | Uint8Array)[] = [];
  private ready = false;
  private dead = false;
  private streamOpen = false;
  private preOpen: Uint8Array[] = [];
  private preOpenBytes = 0;
  constructor(
    private url: string,
    private events: VoiceClientEvents,
    private socketFactory: (url: string) => VoiceClientSocket = browserSocket,
  ) {}
  connect() {
    if (this.socket)
      throw new Error("The voice client is already connected.");
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    socket.onOpen(() => {
      if (this.dead) return;
      this.ready = true;
      for (const item of this.queue) socket.send(item);
      this.queue = [];
    });
    socket.onMessage((data) => {
      if (!this.dead) this.onFrame(data);
    });
    socket.onClose((code) => {
      if (this.dead) return;
      this.dead = true;
      this.queue = [];
      this.events.onClosed({ code, retryable: false });
    });
  }
  open(epoch: number, requestId: string = crypto.randomUUID()) {
    this.streamOpen = false;
    this.preOpen = [];
    this.preOpenBytes = 0;
    this.send(JSON.stringify({ type: "open", epoch, requestId }));
  }
  audio(pcm: Uint8Array) {
    if (!this.streamOpen) {
      while (
        this.preOpen.length &&
        this.preOpenBytes + pcm.length > MAX_PREOPEN_BYTES
      )
        this.preOpenBytes -= this.preOpen.shift()!.length;
      this.preOpen.push(pcm);
      this.preOpenBytes += pcm.length;
      return;
    }
    this.send(pcm);
  }
  end() {
    this.send(JSON.stringify({ type: "end" }));
    this.streamOpen = false;
    this.preOpen = [];
    this.preOpenBytes = 0;
  }
  closeStream() {
    this.send(JSON.stringify({ type: "close" }));
    this.streamOpen = false;
    this.preOpen = [];
    this.preOpenBytes = 0;
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.queue = [];
    this.preOpen = [];
    this.preOpenBytes = 0;
    this.socket?.close();
    this.socket = null;
  }
  private send(data: string | Uint8Array) {
    if (this.dead) return;
    const socket = this.socket;
    if (!socket) throw new Error("The voice client is not connected.");
    if (!this.ready) {
      this.queue.push(data);
      return;
    }
    socket.send(data);
  }
  private onFrame(data: unknown) {
    if (typeof data !== "string") return this.protocol();
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return this.protocol();
    }
    if (typeof raw !== "object" || raw === null) return this.protocol();
    const record = raw as Record<string, unknown>;
    const text = record.text,
      transcript = record.transcript;
    switch (record.type) {
      case "opened": {
        this.streamOpen = true;
        const held = this.preOpen;
        this.preOpen = [];
        this.preOpenBytes = 0;
        for (const pcm of held) this.send(pcm);
        this.events.onOpened();
        return;
      }
      case "partial":
        if (typeof text === "string") {
          this.events.onPartial(text);
          return;
        }
        break;
      case "turn": {
        const turnId = record.turnId;
        if (typeof turnId === "number" && typeof transcript === "string") {
          this.events.onTurn(turnId, transcript);
          return;
        }
        break;
      }
      case "final":
        if (typeof transcript === "string") {
          this.events.onFinal(transcript);
          return;
        }
        break;
      case "gap":
        this.events.onGap();
        return;
      case "closed": {
        const code = record.code,
          retryable = record.retryable,
          reason = record.reason;
        if (typeof code === "number" && typeof retryable === "boolean") {
          this.events.onClosed({
            code,
            retryable,
            reason: typeof reason === "string" ? reason : undefined,
          });
          return;
        }
        break;
      }
      case "error": {
        const code = record.code,
          message = record.message;
        if (typeof code === "string" && typeof message === "string") {
          this.events.onError(code, message);
          return;
        }
        break;
      }
    }
    this.protocol();
  }
  private protocol() {
    this.events.onError(
      "PROTOCOL",
      "The voice stream sent an unreadable message.",
    );
  }
}
