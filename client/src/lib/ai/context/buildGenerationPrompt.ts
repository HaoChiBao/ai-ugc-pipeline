import type { GenerateSlidesRequest } from "@/lib/generation/types";
import { buildRuntimePipelineUserMessage } from "@/lib/ai/prompts/runtimePipelinePrompt";

/** Full user message for OpenAI slideshow JSON generation (theme-first, hands-free). */
export function buildUserGenerationPrompt(
  req: GenerateSlidesRequest,
): string {
  return buildRuntimePipelineUserMessage(req);
}
