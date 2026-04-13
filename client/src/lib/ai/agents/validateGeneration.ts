import {
  assertSlideCountMatches,
  generatedProjectResultSchema,
} from "@/lib/ai/schemas/slides";
import type { GeneratedProjectResult } from "@/lib/generation/types";

function visualTypeNeedsImage(v: string): boolean {
  return (
    v === "image_overlay" || v === "cover" || v === "ranked_item"
  );
}

export function parseAndValidateGeneration(
  raw: unknown,
  slideCount?: number,
  options?: { requireVisualPrompts?: boolean },
): GeneratedProjectResult {
  const parsed = generatedProjectResultSchema.parse(raw);
  assertSlideCountMatches(parsed.slides, slideCount);
  const orders = parsed.slides.map((s) => s.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      throw new Error(
        `Slide orders must be contiguous from 1..N; got ${orders.join(",")}`,
      );
    }
  }

  if (options?.requireVisualPrompts) {
    for (const s of parsed.slides) {
      if (visualTypeNeedsImage(s.visualType)) {
        if (!s.visualPrompt?.trim()) {
          throw new Error(
            `Slide ${s.order}: visualPrompt required when generating visuals for visualType=${s.visualType}`,
          );
        }
      }
    }
  }

  return parsed as GeneratedProjectResult;
}
