import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import {
  captionPackages,
  generatedAssets,
  jobs,
  slideGenerations,
  slides,
} from "./schema";

export async function insertSlideGeneration(values: {
  projectId: string;
  prompt: string;
  mode: string;
  stylePreset?: string | null;
  tone?: string | null;
  slideCount?: number | null;
  generateVisuals: boolean;
  rawRequestJson?: unknown;
  status?: string;
}) {
  const [row] = await db.insert(slideGenerations).values(values).returning();
  return row;
}

export async function updateSlideGeneration(
  id: string,
  patch: Partial<{
    status: string;
    errorMessage: string | null;
    rawResponseJson: unknown;
    updatedAt: Date;
  }>,
) {
  await db
    .update(slideGenerations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(slideGenerations.id, id));
}

export async function getSlideGenerationById(id: string) {
  const [row] = await db
    .select()
    .from(slideGenerations)
    .where(eq(slideGenerations.id, id));
  return row ?? null;
}

export async function listSlideGenerationsByProject(projectId: string, limit = 20) {
  return db
    .select()
    .from(slideGenerations)
    .where(eq(slideGenerations.projectId, projectId))
    .orderBy(desc(slideGenerations.createdAt))
    .limit(limit);
}

export async function insertJobRow(values: {
  generationId: string;
  jobType: string;
  bullmqJobId?: string | null;
  status?: string;
  progress?: number;
  payloadJson?: unknown;
}) {
  const [row] = await db.insert(jobs).values(values).returning();
  return row;
}

export async function updateJobRow(
  id: string,
  patch: Partial<{
    status: string;
    progress: number;
    resultJson: unknown;
    bullmqJobId: string | null;
    updatedAt: Date;
  }>,
) {
  await db
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

export async function getJobByGenerationId(generationId: string) {
  const [row] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.generationId, generationId))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function replaceSlidesForGeneration(
  generationId: string,
  rows: Array<{
    slideOrder: number;
    purpose: string;
    headline: string;
    body?: string | null;
    microcopy?: string | null;
    visualType: string;
    visualPrompt?: string | null;
    sourceAssetIdsJson?: unknown;
    generatedAssetId?: string | null;
  }>,
) {
  await db.delete(slides).where(eq(slides.generationId, generationId));
  if (rows.length === 0) return [];
  return db
    .insert(slides)
    .values(
      rows.map((r) => ({
        generationId,
        ...r,
      })),
    )
    .returning();
}

export async function upsertCaptionPackage(
  generationId: string,
  values: { caption: string; cta?: string | null; hashtagsJson?: unknown },
) {
  await db
    .delete(captionPackages)
    .where(eq(captionPackages.generationId, generationId));
  const [row] = await db
    .insert(captionPackages)
    .values({ generationId, ...values })
    .returning();
  return row;
}

export async function insertGeneratedAsset(values: {
  generationId: string;
  slideId?: string | null;
  provider: string;
  bucket: string;
  storagePath: string;
  publicUrl?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  promptUsed?: string | null;
}) {
  const [row] = await db.insert(generatedAssets).values(values).returning();
  return row;
}

export async function updateSlideGeneratedAsset(
  slideId: string,
  generatedAssetId: string,
) {
  await db
    .update(slides)
    .set({ generatedAssetId })
    .where(eq(slides.id, slideId));
}

export async function getSlidesByGenerationId(generationId: string) {
  return db
    .select()
    .from(slides)
    .where(eq(slides.generationId, generationId))
    .orderBy(slides.slideOrder);
}

export async function getCaptionByGenerationId(generationId: string) {
  const [row] = await db
    .select()
    .from(captionPackages)
    .where(eq(captionPackages.generationId, generationId));
  return row ?? null;
}

export async function getGeneratedAssetsByGenerationId(generationId: string) {
  return db
    .select()
    .from(generatedAssets)
    .where(eq(generatedAssets.generationId, generationId));
}
