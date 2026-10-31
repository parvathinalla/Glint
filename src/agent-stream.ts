import { readEvents } from "../shared/events.ts";
import type { AgentReply } from "../shared/agent.ts";
import { z } from "zod";

export type AgentVoiceEvent =
  | {
      type: "audio";
      seq: number;
      text: string;
      pcm: string;
      sampleRate: number;
    }
  | { type: "audio-error"; seq: number; text: string };

export async function streamAgent(
  csrf: string,
  body: unknown,
  signal: AbortSignal,
  onText: (text: string) => void,
  onFirstText?: () => void,
  onVoice?: (mode: "neural" | "none") => void,
  onAudio?: (event: AgentVoiceEvent) => void,
  onVoiceDone?: () => void,
  onDone?: () => void,
): Promise<AgentReply> {
  const response = await fetch("/api/agent/stream", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-glint-csrf": csrf },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.message || "Glint couldn’t open the response stream.");
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return (await response.json()) as AgentReply;
  let result: AgentReply | undefined;
  let first = true;
  await readEvents(response, (raw) => {
    const event = z
      .object({
        type: z.string(),
        text: z.string().optional(),
        message: z.string().optional(),
        reply: z.unknown().optional(),
        mode: z.string().optional(),
        seq: z.number().optional(),
        pcm: z.string().optional(),
        sampleRate: z.number().optional(),
      })
      .parse(raw);
    if (event.type === "delta" && event.text) {
      if (first) {
        first = false;
        onFirstText?.();
      }
      onText(event.text);
    }
    if (event.type === "voice")
      onVoice?.(event.mode === "neural" ? "neural" : "none");
    if (event.type === "audio" && onAudio) {
      const { seq, text, pcm, sampleRate } = event;
      if (
        typeof seq === "number" &&
        typeof text === "string" &&
        typeof pcm === "string" &&
        typeof sampleRate === "number"
      )
        onAudio({ type: "audio", seq, text, pcm, sampleRate });
    }
    if (event.type === "audio-error" && onAudio) {
      const { seq, text } = event;
      if (typeof seq === "number" && typeof text === "string")
        onAudio({ type: "audio-error", seq, text });
    }
    if (event.type === "voice-done") onVoiceDone?.();
    if (event.type === "done") {
      result = event.reply as AgentReply;
      onDone?.();
    }
    if (event.type === "error")
      throw Error(event.message || "Glint’s response was interrupted.");
  });
  if (!result)
    throw Error(
      "The connection ended before Glint finished. You can retry your message.",
    );
  return result;
}
