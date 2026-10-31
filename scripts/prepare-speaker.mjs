import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The speaker model rides the VAD runtime (copied by prepare-vad.mjs); this
// script only pins the weights. The ORT build is shared, not duplicated.
const model = readFileSync(
  resolve(root, "public/speaker/wespeaker_resnet34_LM.onnx"),
);
if (
  createHash("sha256").update(model).digest("hex") !==
  "e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012"
)
  throw Error("The local speaker model failed its integrity check.");
