import "server-only";

import OpenAI from "openai";
import { getServerEnv } from "@/lib/env/server";

let client: OpenAI | null = null;
let liteClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (client) return client;
  const env = getServerEnv();
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

/**
 * OpenAI client when only OPENAI_API_KEY must be present (e.g. slideshow plan agent).
 * Avoids full getServerEnv() so routes work before DATABASE_URL / Redis / etc. are set.
 */
export function getOpenAILite(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!liteClient) {
    liteClient = new OpenAI({ apiKey: key });
  }
  return liteClient;
}

/** Model for chat completions when not using full server env. */
export function getOpenAIModelMainFromEnv(): string {
  return process.env.OPENAI_MODEL_MAIN?.trim() || "gpt-4.1";
}
