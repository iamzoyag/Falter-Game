import { defineConfig } from "vite";

// Webcam access requires a "secure context" — localhost is fine for dev,
// but anywhere else (e.g. testing from your phone on the same wifi) needs https.
// Uncomment the https block below and use a tool like mkcert if you need that.
export default defineConfig({
  server: {
    host: true,
    port: 5173
    // https: true,
  }
});
