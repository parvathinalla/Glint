// Fetches the server-side Glint voice (Kokoro int8, sherpa ONNX export)
// into .data/tts/. Always targets the production data dir, never
// GLINT_DATA_DIR: scratch environments intentionally run voiceless and
// fall back to device speech. Fail-open: any download or integrity
// failure warns and exits 0 so install/dev/build never break.
//
// Provenance: https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0
// Pinned commit 57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2 (2026-10-26).
// Weights: Kokoro-82M (Apache-2.0) via sherpa-onnx int8 export.
// lexicon-us-en.txt: CMUdict-derived (BSD-like). No espeak/GPL bytes ship:
// synthesis is lexicon-only.
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { URL } from "node:url";
import https from "node:https";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, ".data", "tts");
const base =
  "https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/resolve/57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2";
const files = [
  {
    name: "model.int8.onnx",
    sha256:
      "75635ea3b85a32d00094dcdd61a258aba87c160f7c264c304a7b3ae9d734195e",
  },
  {
    name: "voices.bin",
    sha256:
      "1c5a5b983d3d50d8586d437a51f3faa2da7919ce76a013c081e65671a3447c29",
  },
  {
    name: "tokens.txt",
    sha256:
      "6ebb6bb288f20f3ae8d004d3c2ca27697da27c037d75e81a60e2a6a663f95425",
  },
  {
    name: "lexicon-us-en.txt",
    sha256:
      "7daaab53a181be9885b853a8582bf1838186317e5dadacbcef9c426d6fa0da14",
  },
];
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function get(url, redirects = 0) {
  return new Promise((resolvePromise, reject) => {
    https
      .get(url, { headers: { "User-Agent": "glint-prepare-tts" } }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirects > 10) return reject(Error("too many redirects"));
          res.resume();
          return resolvePromise(
            get(new URL(res.headers.location, url).href, redirects + 1),
          );
        }
        if (res.statusCode !== 200)
          return reject(Error(`HTTP ${res.statusCode} for ${url}`));
        resolvePromise(res);
      })
      .on("error", reject);
  });
}
async function fetchFile(name, sha256Expected) {
  const dest = resolve(dir, name);
  if (existsSync(dest)) {
    try {
      if (sha256(dest) === sha256Expected) {
        console.log(`tts: ${name} ready`);
        return;
      }
      console.log(`tts: ${name} failed its integrity check; re-downloading`);
    } catch {
      console.log(`tts: ${name} unreadable; re-downloading`);
    }
  }
  const tmp = `${dest}.part`;
  const res = await get(`${base}/${name}`);
  await new Promise((resolvePromise, reject) => {
    const file = createWriteStream(tmp);
    res.pipe(file);
    file.on("finish", resolvePromise);
    file.on("error", reject);
    res.on("error", reject);
  });
  if (sha256(tmp) !== sha256Expected) {
    rmSync(tmp, { force: true });
    throw Error(`${name} failed its integrity check after downloading.`);
  }
  renameSync(tmp, dest);
  console.log(`tts: ${name} downloaded`);
}
try {
  mkdirSync(dir, { recursive: true });
  for (const file of files) await fetchFile(file.name, file.sha256);
} catch (error) {
  rmSync(resolve(dir, "model.int8.onnx.part"), { force: true });
  console.warn(
    `WARNING: the Glint neural voice is unavailable (${error.message ?? error}). Replies will use device speech.`,
  );
}
