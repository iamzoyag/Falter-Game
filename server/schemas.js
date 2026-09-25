import { z } from "zod";
import { Type } from "@google/genai";

// Each shape exists twice on purpose: the Gemini schema constrains what the
// model is allowed to generate (fixes most malformed output at the source),
// and the Zod schema validates what actually comes back (catches a safety
// filtered response, or a number that drifts outside range despite the
// generation-time constraint). Together: define the shape once per schema,
// validate everything against it, never hand-parse untrusted JSON again.

export const BeatCopyZod = z.object({
  text: z.string().min(1).max(300)
});
export const BeatCopyGeminiSchema = {
  type: Type.OBJECT,
  properties: { text: { type: Type.STRING } },
  required: ["text"]
};

export const EndingReportZod = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  focusQuote: z.string().max(300).nullable().optional()
});
export const EndingReportGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    body: { type: Type.STRING },
    focusQuote: { type: Type.STRING, nullable: true }
  },
  required: ["title", "body"]
};

export const PacingHintZod = z.object({
  intensityBias: z.number().min(-0.2).max(0.2),
  cooldownMultiplier: z.number().min(0.7).max(1.3),
  focusQuestionId: z.string().nullable().optional(),
  caseFileLine: z.string().max(200).nullable().optional(),
  reasoning: z.string().optional()
});
export const PacingHintGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    intensityBias: { type: Type.NUMBER, minimum: -0.2, maximum: 0.2 },
    cooldownMultiplier: { type: Type.NUMBER, minimum: 0.7, maximum: 1.3 },
    focusQuestionId: { type: Type.STRING, nullable: true },
    caseFileLine: { type: Type.STRING, nullable: true },
    reasoning: { type: Type.STRING }
  },
  required: ["intensityBias", "cooldownMultiplier"]
};


export const TranscriptZod = z.object({
  text: z.string().max(4000) // may be empty: nothing intelligible was said
});
export const TranscriptGeminiSchema = {
  type: Type.OBJECT,
  properties: { text: { type: Type.STRING } },
  required: ["text"]
};

export const InterrogationZod = z.object({
  question: z.string().max(300).nullable().optional(),
  done: z.boolean().optional(),
  observation: z.string().max(200).nullable().optional()
});
export const InterrogationGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING, nullable: true },
    done: { type: Type.BOOLEAN },
    observation: { type: Type.STRING, nullable: true }
  },
  required: ["done"]
};