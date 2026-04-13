import "server-only";

import { parseAndValidateGeneration } from "@/lib/ai/agents/validateGeneration";
import {
  getGeneratedAssetsByGenerationId,
  getSlideGenerationById,
  getSlidesByGenerationId,
} from "@/lib/db/generations";
import { createSignedUrl } from "@/lib/storage/supabaseStorage";
import type { GeneratedProjectResult } from "@/lib/generation/types";

export type SlideWithSignedImage = GeneratedProjectResult["slides"][number] & {
  signedImageUrl?: string;
};

export type GeneratedProjectResultForClient = Omit<
  GeneratedProjectResult,
  "slides"
> & {
  slides: SlideWithSignedImage[];
};

export async function assembleCompletedGeneration(
  generationId: string,
): Promise<GeneratedProjectResultForClient | null> {
  const gen = await getSlideGenerationById(generationId);
  if (!gen?.rawResponseJson || gen.status !== "completed") {
    return null;
  }

  const base = parseAndValidateGeneration(
    gen.rawResponseJson,
    gen.slideCount ?? undefined,
    { requireVisualPrompts: Boolean(gen.generateVisuals) },
  );

  const slideRows = await getSlidesByGenerationId(generationId);
  const byOrder = new Map(slideRows.map((r) => [r.slideOrder, r]));
  const genAssets = await getGeneratedAssetsByGenerationId(generationId);
  const assetById = new Map(genAssets.map((a) => [a.id, a]));

  const slides: SlideWithSignedImage[] = await Promise.all(
    base.slides.map(async (s) => {
      const row = byOrder.get(s.order);
      let signedImageUrl: string | undefined;
      if (row?.generatedAssetId) {
        const ga = assetById.get(row.generatedAssetId);
        if (ga) {
          signedImageUrl = await createSignedUrl(
            ga.bucket,
            ga.storagePath,
            3600,
          );
        }
      }
      return {
        ...s,
        generatedAssetId: row?.generatedAssetId ?? s.generatedAssetId,
        signedImageUrl,
      };
    }),
  );

  return { ...base, slides };
}
