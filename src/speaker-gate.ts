import type { SpeakerCheck } from "./speaker-id.ts";

/** Wait for a verified owner before dispatch. Unknown is never permission. */
export function waitForSpeaker(
  check: SpeakerCheck | null,
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<"owner" | "stranger" | "unknown"> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (!check) return Promise.resolve("unknown");
  return new Promise((resolve, reject) => {
    const finish = (verdict: "owner" | "stranger" | "unknown") => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(verdict);
    };
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => finish("unknown"), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    check.promise.then(verdict => finish(verdict ?? "unknown"), () => finish("unknown"));
  });
}
