import "server-only";

import type { Job } from "bullmq";
import { generateSlidesWithOpenAI } from "@/lib/ai/agents/generateSlides";
import { generateSlidesRequestSchema } from "@/lib/ai/schemas/generation";
import {
  getSlideGenerationById,
  insertGeneratedAsset,
  replaceSlidesForGeneration,
  updateJobRow,
  updateSlideGeneration,
  updateSlideGeneratedAsset,
  upsertCaptionPackage,
} from "@/lib/db/generations";
import { getCanvasAssetById } from "@/lib/db/assets";
import { createGeminiImageProvider } from "@/lib/images/gemini";
import { getServerEnv } from "@/lib/env/server";
import {
  createSignedUrl,
  generatedAssetPath,
  uploadBufferToBucket,
} from "@/lib/storage/supabaseStorage";
import type { GenerateSlidesJobData } from "@/lib/jobs/queues";
import type { GeneratedProjectResult } from "@/lib/generation/types";

function visualTypeWarrantsImage(visualType: string): boolean {
  return (
    visualType === "image_overlay" ||
    visualType === "cover" ||
    visualType === "ranked_item"
  );
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

async function readableUrlForCanvasAsset(assetId: string): Promise<string | null> {
  const row = await getCanvasAssetById(assetId);
  if (!row) return null;
  if (row.publicUrl) return row.publicUrl;
  return createSignedUrl(row.bucket, row.storagePath, 3600);
}

function mergeReferenceIds(
  planIds: string[] | undefined,
  rawReq: { useSelectedCanvasAssets?: boolean; selectedCanvasAssetIds?: string[] },
): string[] {
  const fromPlan = planIds ?? [];
  const fromSelection =
    rawReq.useSelectedCanvasAssets && rawReq.selectedCanvasAssetIds?.length
      ? rawReq.selectedCanvasAssetIds
      : [];
  return [...new Set([...fromPlan, ...fromSelection])].slice(0, 8);
}

export async function processGenerateSlidesJob(
  job: Job<GenerateSlidesJobData>,
): Promise<{ result: GeneratedProjectResult }> {
  const { generationId, jobRowId } = job.data;
  const env = getServerEnv();

  await job.updateProgress(5);
  await updateJobRow(jobRowId, { status: "active", progress: 5 });

  const genRow = await getSlideGenerationById(generationId);
  if (!genRow) {
    throw new Error(`Generation not found: ${generationId}`);
  }

  await updateSlideGeneration(generationId, { status: "running", errorMessage: null });

  const rawReq = generateSlidesRequestSchema.parse(genRow.rawRequestJson);

  await job.updateProgress(15);
  await updateJobRow(jobRowId, { progress: 15 });

  const result = await generateSlidesWithOpenAI(rawReq);

  await job.updateProgress(50);
  await updateJobRow(jobRowId, { progress: 50 });

  await updateSlideGeneration(generationId, {
    rawResponseJson: result as unknown as Record<string, unknown>,
  });

  const slideRows = result.slides.map((s) => ({
    slideOrder: s.order,
    purpose: s.purpose,
    headline: s.headline,
    body: s.body ?? null,
    microcopy: s.microcopy ?? null,
    visualType: s.visualType,
    visualPrompt: s.visualPrompt ?? null,
    sourceAssetIdsJson: s.recommendedReferenceAssetIds ?? [],
    generatedAssetId: null as string | null,
  }));

  const inserted = await replaceSlidesForGeneration(generationId, slideRows);

  await upsertCaptionPackage(generationId, {
    caption: result.captionPackage.caption,
    cta: result.captionPackage.cta ?? null,
    hashtagsJson: result.captionPackage.hashtags,
  });

  const projectId = genRow.projectId;
  const genBucket = env.SUPABASE_STORAGE_GENERATED_BUCKET;

  if (
    rawReq.generateVisuals &&
    env.ENABLE_GEMINI_IMAGE_GEN &&
    inserted.length > 0
  ) {
    const provider = createGeminiImageProvider();
    let i = 0;
    const total = inserted.filter((row) => {
      const plan = result.slides.find((s) => s.order === row.slideOrder);
      return (
        plan?.visualPrompt &&
        visualTypeWarrantsImage(plan.visualType)
      );
    }).length;

    for (const row of inserted) {
      const plan = result.slides.find((s) => s.order === row.slideOrder);
      if (!plan?.visualPrompt || !visualTypeWarrantsImage(plan.visualType)) {
        continue;
      }

      const refIds = mergeReferenceIds(
        plan.recommendedReferenceAssetIds,
        rawReq,
      );
      const referenceImages: { publicUrl: string; mimeType?: string }[] = [];
      for (const id of refIds) {
        const url = await readableUrlForCanvasAsset(id);
        if (url) {
          const asset = await getCanvasAssetById(id);
          referenceImages.push({
            publicUrl: url,
            mimeType: asset?.mimeType ?? undefined,
          });
        }
      }

      const image = await provider.generateFromPrompt({
        prompt: plan.visualPrompt,
        referenceImages,
        style: rawReq.stylePreset,
        cohesiveSlideshow: {
          theme: rawReq.theme,
          slideIndex: row.slideOrder,
          totalSlides: result.slides.length,
          tone: rawReq.tone,
        },
      });

      const ext = extFromMime(image.mimeType);
      const path = generatedAssetPath(projectId, generationId, row.id, ext);

      await uploadBufferToBucket({
        bucket: genBucket,
        path,
        body: image.buffer,
        contentType: image.mimeType,
        upsert: true,
      });

      const ga = await insertGeneratedAsset({
        generationId,
        slideId: row.id,
        provider: "gemini",
        bucket: genBucket,
        storagePath: path,
        publicUrl: null,
        mimeType: image.mimeType,
        width: image.width ?? null,
        height: image.height ?? null,
        promptUsed: plan.visualPrompt,
      });

      await updateSlideGeneratedAsset(row.id, ga.id);
      i += 1;
      const p = 50 + Math.floor((40 * i) / Math.max(total, 1));
      await job.updateProgress(Math.min(p, 95));
      await updateJobRow(jobRowId, { progress: Math.min(p, 95) });
    }
  }

  await updateSlideGeneration(generationId, { status: "completed" });
  await updateJobRow(jobRowId, {
    status: "completed",
    progress: 100,
    resultJson: result as unknown as Record<string, unknown>,
  });
  await job.updateProgress(100);

  return { result };
}
