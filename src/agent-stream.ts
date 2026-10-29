import { readEvents } from "../shared/events.ts";
import type { AgentReply } from "../shared/agent.ts";
import { z } from "zod";

export async function streamAgent(
  csrf: string,
  body: unknown,
  signal: AbortSignal,
  onText: (text: string) => void,
  onFirstText?: () => void,
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
      })
      .parse(raw);
    if (event.type === "delta" && event.text) {
      if (first) {
        first = false;
        onFirstText?.();
      }
      onText(event.text);
    }
    if (event.type === "done") result = event.reply as AgentReply;
    if (event.type === "error")
      throw Error(event.message || "Glint’s response was interrupted.");
  });
  if (!result)
    throw Error(
      "The connection ended before Glint finished. You can retry your message.",
    );
  return result;
}
