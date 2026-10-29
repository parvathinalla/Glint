import { mkdirSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = resolve(root, "public/vision/runtime");
mkdirSync(runtime, { recursive: true });
const sdk = resolve(root, "node_modules/@mediapipe/tasks-vision");
const copy = (source, destination) => {
  if (
    !existsSync(destination) ||
    !readFileSync(source).equals(readFileSync(destination))
  )
    copyFileSync(source, destination);
};
copy(resolve(sdk, "vision_bundle.js"), resolve(runtime, "vision_bundle.js"));
for (const file of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
])
  copy(resolve(sdk, "wasm", file), resolve(runtime, file));
const model = readFileSync(
  resolve(root, "public/vision/pose_landmarker_lite.task"),
);
if (
  createHash("sha256").update(model).digest("hex") !==
  "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"
)
  throw Error("The local pose model failed its integrity check.");
