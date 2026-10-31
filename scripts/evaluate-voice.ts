import { readFile } from "node:fs/promises";
import { evaluateVoiceQuality } from "../shared/voice-quality.ts";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npx tsx scripts/evaluate-voice.ts labeled-voice-cases.json");
  process.exitCode = 1;
} else {
  try {
    const report = evaluateVoiceQuality(JSON.parse(await readFile(input, "utf8")));
    console.log(JSON.stringify(report, null, 2));
    if (!report.preliminaryGatePassed) process.exitCode = 1;
  } catch {
    // Do not echo invalid content: it could contain private text or keys.
    console.error("Voice evaluation input is invalid. Use the documented content-free case format.");
    process.exitCode = 1;
  }
}
