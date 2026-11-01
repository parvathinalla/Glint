import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
export default defineConfig({
  plugins: [react()],
  // VAD and speaker inference use WASM only. The all-backend bundle also
  // includes protobuf optional-module eval probes that strict CSP blocks.
  resolve:{alias:[{find:/^onnxruntime-web$/,replacement:fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/ort.wasm.min.js",import.meta.url))}]},
  server: {
    host: "127.0.0.1",
    watch: {
      ignored: [
        "**/visual-proof/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/docs/**",
        "**/.data/**",
        "**/public/vision/runtime/**",
        "**/public/vad/runtime/**",
      ],
    },
  },
  build: { sourcemap: false },
});
