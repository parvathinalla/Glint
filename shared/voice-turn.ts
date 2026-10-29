/** Bounded local endpoint detection: silence never dispatches a model request. */
export class VoiceTurnDetector {
  private pre: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private time = 0;
  private began = 0;
  private lastVoice = 0;
  private candidate = 0;
  private voiced = 0;
  private cooldown = false;
  private quiet = 0;
  active = false;
  constructor(private rate: number) {}
  reset() {
    this.pre = [];
    this.chunks = [];
    this.active = false;
    this.candidate = 0;
    this.voiced = 0;
  }
  push(
    frame: Float32Array,
    threshold = 0.014,
  ): { started?: boolean; audio?: Float32Array } {
    const ms = (frame.length / this.rate) * 1000;
    this.time += ms;
    const level = Math.sqrt(
      frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length,
    );
    const speech = level >= threshold;
    if (this.cooldown) {
      this.quiet = speech ? 0 : this.quiet + ms;
      if (this.quiet >= 400) {
        this.cooldown = false;
        this.quiet = 0;
      }
      return {};
    }
    let started = false;
    if (!this.active) {
      this.pre.push(frame.slice());
      while (
        this.pre.reduce((sum, chunk) => sum + chunk.length, 0) >
        this.rate * 0.3
      )
        this.pre.shift();
      this.candidate = speech ? this.candidate + ms : 0;
      if (this.candidate < 160) return {};
      this.active = true;
      started = true;
      this.began = this.time - this.candidate;
      this.lastVoice = this.time;
      this.voiced = this.candidate;
      this.chunks = this.pre;
      this.pre = [];
    } else {
      this.chunks.push(frame.slice());
      if (speech) {
        this.lastVoice = this.time;
        this.voiced += ms;
      }
    }
    if (this.time - this.began >= 14000 || this.time - this.lastVoice >= 850) {
      const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const audio = new Float32Array(Math.min(length, this.rate * 15));
      let offset = 0;
      for (const chunk of this.chunks) {
        const part = chunk.subarray(0, Math.max(0, audio.length - offset));
        audio.set(part, offset);
        offset += part.length;
      }
      const usable = this.voiced >= 200;
      this.reset();
      this.cooldown = true;
      this.quiet = 0;
      return usable ? { audio } : {};
    }
    return { started };
  }
}
export function voiceWav(samples: Float32Array, sourceRate: number): Blob {
  const length = Math.min(
    360000,
    Math.floor((samples.length * 24000) / sourceRate),
  );
  const bytes = new ArrayBuffer(44 + length * 2),
    view = new DataView(bytes);
  const word = (at: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const position = (i * sourceRate) / 24000,
      index = Math.floor(position),
      fraction = position - index;
    const sample =
      samples[index] * (1 - fraction) +
      (samples[Math.min(index + 1, samples.length - 1)] ?? 0) * fraction;
    const bounded = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + i * 2,
      Math.round(bounded * (bounded < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Blob([bytes], { type: "audio/wav" });
}
