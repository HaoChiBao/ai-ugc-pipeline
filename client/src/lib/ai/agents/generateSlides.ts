import "server-only";

import { buildUserGenerationPrompt } from "@/lib/ai/context/buildGenerationPrompt";
import { parseAndValidateGeneration } from "@/lib/ai/agents/validateGeneration";
import { buildSlideshowSystemPrompt } from "@/lib/ai/prompts/systemPrompt";
import type { GenerateSlidesRequest } from "@/lib/generation/types";
import type { GeneratedProjectResult } from "@/lib/generation/types";
import { getOpenAI } from "@/lib/openai/client";
import { getServerEnv } from "@/lib/env/server";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object");
  }
  const slice = trimmed.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}

export async function generateSlidesWithOpenAI(
  request: GenerateSlidesRequest,
): Promise<GeneratedProjectResult> {
  const env = getServerEnv();
  const openai = getOpenAI();
  const system = buildSlideshowSystemPrompt();
  const user = buildUserGenerationPrompt(request);

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL_MAIN,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: request.mode === "creative" ? 0.9 : 0.5,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion from OpenAI");
  }

  const raw = extractJsonObject(content);
  return parseAndValidateGeneration(raw, request.slideCount, {
    requireVisualPrompts: Boolean(request.generateVisuals),
  });
}
