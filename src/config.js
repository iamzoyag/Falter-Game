// Vite only exposes env vars prefixed VITE_ to browser code (see .env.example).
// The backend URL is the only thing the frontend needs to know about the AI
// server — everything else (the API key, the model, prompts) stays server-side.
export const AI_BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || "http://localhost:8787";
