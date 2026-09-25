import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateBeatCopy, generateEndingReport, generatePacingHint } from "./llm.js";

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "Missing GEMINI_API_KEY. Copy server/.env.example to server/.env and fill in a real key before starting this server."
  );
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "256kb" })); // dossiers are small; this is generous, not a real limit-need
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173"
  })
);

// Simple in-memory rate limiting — good enough for a single-player local game,
// not meant to survive being pointed at the public internet as-is.
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 20;
const hits = [];
app.use((req, res, next) => {
  const now = Date.now();
  while (hits.length && hits[0] < now - RATE_LIMIT_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_LIMIT_MAX) return res.status(429).json({ error: "rate_limited" });
  hits.push(now);
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/beat", async (req, res) => {
  try {
    const { signalType, localFallbackText, dossier, questionIndex } = req.body || {};
    if (typeof signalType !== "string") return res.status(400).json({ error: "signalType required" });
    const result = await generateBeatCopy({
      signalType,
      localFallbackText: String(localFallbackText || ""),
      dossier: Array.isArray(dossier) ? dossier : [],
      questionIndex: Number(questionIndex) || 0
    });
    if (!result?.text) return res.status(502).json({ error: "no_result" });
    res.json({ text: String(result.text).slice(0, 300) });
  } catch (err) {
    console.error("[/api/beat]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

app.post("/api/ending", async (req, res) => {
  try {
    const { dossier } = req.body || {};
    const result = await generateEndingReport({ dossier: Array.isArray(dossier) ? dossier : [] });
    if (!result?.title || !result?.body) return res.status(502).json({ error: "no_result" });
    res.json({
      title: String(result.title).slice(0, 120),
      body: String(result.body).slice(0, 1000),
      focusQuote: typeof result.focusQuote === "string" ? result.focusQuote.slice(0, 300) : null
    });
  } catch (err) {
    console.error("[/api/ending]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

app.post("/api/pacing", async (req, res) => {
  try {
    const { dossier, recentSignals } = req.body || {};
    const result = await generatePacingHint({
      dossier: Array.isArray(dossier) ? dossier : [],
      recentSignals: Array.isArray(recentSignals) ? recentSignals : []
    });
    if (!result) return res.status(502).json({ error: "no_result" });
    res.json({
      intensityBias: Number(result.intensityBias) || 0,
      cooldownMultiplier: Number(result.cooldownMultiplier) || 1,
      focusQuestionId: typeof result.focusQuestionId === "string" ? result.focusQuestionId : null,
      caseFileLine: typeof result.caseFileLine === "string" ? result.caseFileLine.slice(0, 200) : null
    });
  } catch (err) {
    console.error("[/api/pacing]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`falter AI backend listening on http://localhost:${port}`);
});
