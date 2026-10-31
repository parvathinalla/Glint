import { mkdirSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = resolve(root, "public/vad/runtime");
mkdirSync(runtime, { recursive: true });
const ort = resolve(root, "node_modules/onnxruntime-web/dist");
const copy = (source, destination) => {
  if (
    !existsSync(destination) ||
    !readFileSync(source).equals(readFileSync(destination))
  )
    copyFileSync(source, destination);
};
// Single-threaded builds only: the app is not cross-origin isolated (COEP
// would break API fetches), so threaded WASM cannot load. ORT picks the
// SIMD build when supported and falls back to plain otherwise.
copy(resolve(ort, "ort-wasm-simd.wasm"), resolve(runtime, "ort-wasm-simd.wasm"));
copy(resolve(ort, "ort-wasm.wasm"), resolve(runtime, "ort-wasm.wasm"));
const model = readFileSync(resolve(root, "public/vad/silero_vad.onnx"));
if (
  createHash("sha256").update(model).digest("hex") !==
  "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
)
  throw Error("The local Silero VAD model failed its integrity check.");
