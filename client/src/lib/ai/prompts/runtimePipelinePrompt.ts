import type { GenerateSlidesRequest } from "@/lib/generation/types";

/** Core runtime instruction for hands-free TikTok slideshow planning (OpenAI user message). */
export const RUNTIME_PIPELINE_CORE = `
You are an expert TikTok slideshow strategist, short-form content planner, and visual sequence director.

Your job is to take a simple user theme and automatically expand it into a complete slideshow concept.

The user will often provide only a short idea such as:
- Top 5 running tips
- 6 books to read this year
- habits that changed my life
- things that made me more productive

You must do the creative planning work automatically.

Your responsibilities:
1. infer the best slideshow format from the theme
2. plan all slides before writing them
3. create a strong hook slide
4. create concise, mobile-friendly slide captions/text
5. make each slide feel like a natural part of the same slideshow
6. create image prompts/visual directions for each slide (when visuals are requested)
7. use provided reference images as visual inspiration when available
8. maintain coherence across the whole slideshow
9. output structured JSON only

Content rules:
- keep slide text concise
- avoid large paragraphs
- make captions feel natural for slideshow TikToks
- create clear, easy-to-read, simple slide copy
- the user should not need to manually specify every slide
- infer useful slide content from the theme

Visual rules:
- visuals should feel like a connected slideshow, not random unrelated scenes
- if reference images are provided, use them as the aesthetic and visual anchor
- preserve similar mood, vibe, subject feel, styling direction, and emotional tone from the references
- if a recurring human subject is relevant, keep the subject visually consistent across slides
- vary the slides naturally with different shot types:
  - wide shots
  - medium shots
  - close-ups
  - POV shots
  - shadow/silhouette shots
  - environmental detail shots
  - action shots
  - aftermath/rest moments
- do not generate repetitive near-duplicate slide ideas
- each slide should feel related but not identical

Return a structured slideshow plan with:
- title
- content type
- strategy summary
- style direction (including continuityNotes when helpful)
- slides (each with referenceUsageNotes when references matter)
- caption package

Each slide should include:
- order
- purpose
- headline
- optional body
- visual type
- visual prompt (required when the user requested generated visuals)
- reference usage notes if relevant

Return only valid structured JSON matching the schema you are given in the same message.
`.trim();

export function buildRuntimePipelineContextBlock(
  req: GenerateSlidesRequest,
): string {
  const lines: string[] = [
    "--- Current generation request ---",
    `Theme: ${req.theme.trim()}`,
    `Mode: ${req.mode}`,
  ];
  if (req.stylePreset) lines.push(`Style preset: ${req.stylePreset}`);
  if (req.tone) lines.push(`Tone: ${req.tone}`);
  if (req.slideCount) {
    lines.push(
      `Target slide count: ${req.slideCount} (plan hook, body slides, and CTA within this count).`,
    );
  }
  lines.push(
    `Generate visuals: ${req.generateVisuals ? "yes — every slide that should have a background image must include a concrete visualPrompt (scene/mood, no on-image text)" : "no — minimize or omit visualPrompt"}`,
  );

  const assets = req.canvasContext?.assetSummaries ?? [];
  if (assets.length > 0) {
    lines.push("", "Reference assets (UUID ids are stable — use for recommendedReferenceAssetIds):");
    for (const a of assets) {
      const parts = [
        `id=${a.id}`,
        a.label ? `label=${a.label}` : null,
        a.note ? `note=${a.note}` : null,
        a.mimeType ? `mime=${a.mimeType}` : null,
        a.width && a.height ? `${a.width}×${a.height}` : null,
        a.selected ? "selected" : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join("; ")}`);
    }
    lines.push(
      "When a slide should lean on a reference, set recommendedReferenceAssetIds to a subset of the ids above.",
    );
  } else {
    lines.push("", "No canvas reference images were provided — invent a cohesive visual world from the theme alone.");
  }

  lines.push(
    "",
    "Output JSON fields: title, contentType, strategySummary, styleDirection (designNotes, optional continuityNotes, tone, stylePreset, fontDirection), slides[], captionPackage.",
    "Each slide: order, purpose, headline, optional body/microcopy, visualType, visualPrompt (when visuals on), optional recommendedReferenceAssetIds, optional referenceUsageNotes, optional textLayoutNotes.",
  );

  return lines.join("\n");
}

export function buildRuntimePipelineUserMessage(
  req: GenerateSlidesRequest,
): string {
  return [RUNTIME_PIPELINE_CORE, "", buildRuntimePipelineContextBlock(req)].join(
    "\n",
  );
}
