import { TRANSCRIBE_MODE, WHISPER_MODEL } from "../config.js";
import { resample, encodeWavBase64 } from "./MicRecorder.js";

// Speech-to-text for spoken answers. See TRANSCRIBE_MODE in config.js.
// Server mode (Gemini) is used only if the player opted into AI; otherwise, or
// if the server call fails, Whisper runs locally in the browser.
export class Transcriber {
  constructor({ aiClient, aiEnabled }) {
    this.ai = aiClient;
    this.useServer = TRANSCRIBE_MODE === "server" && aiEnabled;
    this._pipe = null;
    this._loading = null;
  }

  /** Start downloading the local model in the background */
  warmup() {
    if (this.useServer) return;
    this._loadLocal().catch(() => {});
  }

  _loadLocal() {
    if (this._pipe) return Promise.resolve(this._pipe);
    if (this._loading) return this._loading;
    this._loading = (async () => {
      // dynamic import: keeps transformers.js out of the main bundle
      const { pipeline, env } = await import("@huggingface/transformers");
      // don't look for models on our own dev server (Vite would answer with index.html)
      env.allowLocalModels = false;
      // navigator.gpu can exist with no usable adapter, so actually ask for one
      const adapter = await navigator.gpu?.requestAdapter?.().catch(() => null);
      if (adapter) {
        try {
          this._pipe = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
            device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }
          });
          return this._pipe;
        } catch (err) {
          console.warn("[Transcriber] WebGPU failed, using WASM", err);
        }
      }
      this._pipe = await pipeline("automatic-speech-recognition", WHISPER_MODEL, { device: "wasm", dtype: "q8" });
      return this._pipe;
    })();
    this._loading.catch((err) => {
      console.warn("[Transcriber] local Whisper failed to load", err);
      this._loading = null;
    });
    return this._loading;
  }

  /** @returns {Promise<string|null>} */
  async transcribe(samples, sampleRate) {
    if (!samples?.length) return null;
    const pcm16k = await resample(samples, sampleRate, 16000);

    if (this.useServer) {
      const res = await this.ai.requestTranscription({ audio: encodeWavBase64(pcm16k, 16000), mimeType: "audio/wav" });
      if (typeof res?.text === "string") return cleanTranscript(res.text);
      // fall through to local if the server is down
    }
    try {
      const pipe = await this._loadLocal();
      const out = await pipe(pcm16k, { chunk_length_s: 30 });
      return cleanTranscript((Array.isArray(out) ? out[0]?.text : out?.text) || "");
    } catch (err) {
      console.warn("[Transcriber]", err);
      return null;
    }
  }
}

// Whisper's known failure modes on silence/noise: bracketed tags, stock
// phrases, and degenerate repetition ("B-B-B-B-…").
function cleanTranscript(raw) {
  const t = raw.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();
  if (!t) return null;
  if (/^(you\.?|thank you\.?|thanks for watching!?|bye\.?)$/i.test(t)) return null;
  if (/(\w.{0,11}?)(?:[\s,-]*\1){5,}/.test(t)) return null;
  return t.slice(0, 400);
}