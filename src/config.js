export const AI_BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || "http://localhost:8787";
export const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const TRANSCRIBE_MODE = import.meta.env.VITE_TRANSCRIBE_MODE || "server";
export const WHISPER_MODEL = import.meta.env.VITE_WHISPER_MODEL || "onnx-community/whisper-base.en";
export const FIGURE_URLS = [1, 2, 3, 4, 5].map((n) => `/figures/figure${n}.png`);
export const FLASH_URLS = Array.from({ length: 12 }, (_, i) => `/flashes/flash${String(i + 1).padStart(2, "0")}.png`);