import {
  CAPTION_RULES,
  GROUNDED_VS_CREATIVE,
  SLIDE_TEXT_RULES,
} from "./generationRules";

/** System message: JSON-only output + guardrails; runtime planning lives in the user message. */
export function buildSlideshowSystemPrompt(): string {
  return [
    "You are an expert TikTok slideshow strategist and visual sequence director.",
    "The user message contains the full runtime pipeline: theme expansion, slide planning, and visual coherence rules.",
    "You MUST output a single JSON object only — no markdown fences, no commentary before or after.",
    "The JSON must match: title, contentType, strategySummary, styleDirection (designNotes required; include continuityNotes when it helps cohesion), slides[], captionPackage.",
    "Each slide: order (1..N contiguous), purpose, headline, optional body/microcopy, visualType, visualPrompt when generation requests visuals, optional recommendedReferenceAssetIds and referenceUsageNotes.",
    SLIDE_TEXT_RULES,
    GROUNDED_VS_CREATIVE,
    CAPTION_RULES,
    "visualPrompt describes background/scene imagery only — never on-image typography.",
    "When visuals are requested, every slide that uses image_overlay, cover, or ranked_item must include a strong, specific visualPrompt for a cohesive vertical 9:16 slideshow sequence.",
  ].join("\n\n");
}
