import { z } from "zod";
import { voiceDiagnostic } from "./voice-diagnostics.ts";

export const voiceQualityInput = z.object({
  cases: z.array(z.object({
    scenario: z.enum(["quiet", "noise", "background", "overlap", "short", "network"]),
    language: z.enum(["telugu", "english", "mixed"]),
    device: z.enum(["android", "iphone"]),
    expectedReply: z.boolean(),
    events: z.array(voiceDiagnostic).min(1).max(120),
  }).strict().refine(value => new Set(value.events.map(event => event.turn)).size === 1,
    "Each case must contain exactly one turn.")).max(10000),
}).strict();

/** Evaluate labeled recordings, not model mocks. Missing evidence is never a pass. */
export function evaluateVoiceQuality(raw: unknown) {
  const { cases } = voiceQualityInput.parse(raw);
  const dispatched = (value: typeof cases[number]) => value.events.some(event => event.stage === "reply-dispatched");
  const owner = cases.filter(value => value.expectedReply);
  const background = cases.filter(value => value.scenario === "background" && !value.expectedReply);
  const percentage = (count: number, total: number) => total ? Math.round(1000 * count / total) / 10 : null;
  const acceptedOwnerPercent = percentage(owner.filter(dispatched).length, owner.length);
  const backgroundActivationPercent = percentage(background.filter(dispatched).length, background.length);
  const audio = owner.filter(dispatched).map(value => value.events.find(event =>
    (event.stage === "audio-scheduled" || event.stage === "device-playback-start") && event.durationMs !== undefined)?.durationMs)
    .filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const p95 = audio.length ? audio[Math.ceil(audio.length * 0.95) - 1] : null;
  const missingEvidence: string[] = [];
  if (cases.some(value => !value.events.some(event => ["reply-dispatched", "turn-rejected", "detector-drop"].includes(event.stage))))
    missingEvidence.push("Some turns have no recorded decision; do not score incomplete tests as success.");
  if (owner.length < 100) missingEvidence.push("At least 100 labeled owner turns required.");
  if (background.length < 100) missingEvidence.push("At least 100 labeled background-only turns required.");
  for (const scenario of ["quiet", "noise", "background", "overlap", "short", "network"])
    if (cases.filter(value => value.scenario === scenario).length < 20)
      missingEvidence.push(`At least 20 ${scenario} cases required.`);
  for (const language of ["telugu", "english", "mixed"])
    if (!cases.some(value => value.language === language)) missingEvidence.push(`Missing ${language} tests.`);
  for (const device of ["android", "iphone"])
    if (!cases.some(value => value.device === device)) missingEvidence.push(`Missing ${device} tests.`);
  if (audio.length < owner.filter(dispatched).length) missingEvidence.push("Some replies have no browser playback measurement.");
  return {
    cases: cases.length, ownerTurns: owner.length, backgroundTurns: background.length,
    acceptedOwnerPercent, backgroundActivationPercent,
    detectedTurnEndToBrowserAudioP95Ms: p95,
    audioEvidence: "Neural scheduling or device onstart; not confirmation of audible sound. Excludes endpoint detection delay.",
    missingEvidence,
    preliminaryGatePassed: missingEvidence.length === 0 && acceptedOwnerPercent !== null &&
      acceptedOwnerPercent >= 95 && backgroundActivationPercent !== null && backgroundActivationPercent < 5 && p95 !== null && p95 <= 2000,
    productionReady: false,
    remainingValidation: "Manual audible playback, interruption-stop latency, transcript accuracy, privacy, load, cost and recovery tests are also required.",
  };
}
