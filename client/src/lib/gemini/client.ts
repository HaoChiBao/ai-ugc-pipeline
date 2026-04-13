import "server-only";

import { GoogleGenAI, Modality } from "@google/genai";
import { getServerEnv } from "@/lib/env/server";

let ai: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (ai) return ai;
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return ai;
}

export { Modality };
