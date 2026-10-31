// Fetches the server-side Glint voice (Kitten TTS Nano v0.2 fp16,
// sherpa ONNX export) into .data/tts-kitten/. Always targets the
// production data dir, never GLINT_DATA_DIR: scratch environments
// intentionally run voiceless and fall back to device speech.
// Fail-open: any download or integrity failure warns and exits 0 so
// install/dev/build never break.
//
// Provenance: https://huggingface.co/csukuangfj/kitten-nano-en-v0_2-fp16
// Pinned commit 7d14a97d38072576ddca7a673ab5bb49c43bb169 (2026-10-26).
// Weights: KittenTTS Nano (Apache-2.0) via sherpa-onnx fp16 export.
// lexicon-us-en.txt: CMUdict-derived (BSD-like), shared with the Kokoro
// fallback voice. No espeak/GPL bytes ship: synthesis is lexicon-only.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, ".data", "tts-kitten");
const base =
  "https://huggingface.co/csukuangfj/kitten-nano-en-v0_2-fp16/resolve/7d14a97d38072576ddca7a673ab5bb49c43bb169";
const kokoroBase =
  "https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/resolve/57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2";
const files = [
  {
    name: "model.fp16.onnx",
    sha256:
      "f24264d818087e643828da7a992e892e703c412bf147e152b825da567031d5ce",
  },
  {
    name: "voices.bin",
    sha256:
      "42a40a24a352a38657d6cb86ceee51bbc2b7780b29e04fb60bcdf959adccea01",
  },
  {
    name: "tokens.txt",
    sha256:
      "934a4188addc7665dd3410256bb622169242357fbb99d840d9351209b486dabb",
  },
  {
    name: "lexicon-us-en.txt",
    base: kokoroBase,
    sha256:
      "7daaab53a181be9885b853a8582bf1838186317e5dadacbcef9c426d6fa0da14",
  },
];
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
async function get(url) {
  // Global fetch (not node:https): it honors proxy env vars, so this
  // also works in sandboxed/egress-proxied environments.
  const res = await globalThis.fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "glint-prepare-kitten" },
  });
  if (!res.ok) throw Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
async function fetchFile(name, sha256Expected, fileBase = base) {
  const dest = resolve(dir, name);
  if (existsSync(dest)) {
    try {
      if (sha256(dest) === sha256Expected) {
        console.log(`tts-kitten: ${name} ready`);
        return;
      }
      console.log(
        `tts-kitten: ${name} failed its integrity check; re-downloading`,
      );
    } catch {
      console.log(`tts-kitten: ${name} unreadable; re-downloading`);
    }
  }
  const tmp = `${dest}.part`;
  writeFileSync(tmp, await get(`${fileBase}/${name}`));
  if (sha256(tmp) !== sha256Expected) {
    rmSync(tmp, { force: true });
    throw Error(`${name} failed its integrity check after downloading.`);
  }
  renameSync(tmp, dest);
  console.log(`tts-kitten: ${name} downloaded`);
}
try {
  mkdirSync(dir, { recursive: true });
  for (const file of files)
    await fetchFile(file.name, file.sha256, file.base ?? base);
} catch (error) {
  rmSync(resolve(dir, "model.fp16.onnx.part"), { force: true });
  console.warn(
    `WARNING: the Glint neural voice is unavailable (${error.message ?? error}). Replies will use device speech.`,
  );
}
