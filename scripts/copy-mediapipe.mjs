// Self-host MediaPipe's WASM runtime (copied from node_modules) so person masking works on flaky Wi-Fi.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  for (const name of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
    cpSync(`${from}/${name}`, `${to}/${name}`);
  }
}
