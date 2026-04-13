import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { canvasAssets } from "./schema";

export async function insertCanvasAsset(values: {
  projectId: string;
  bucket: string;
  storagePath: string;
  publicUrl?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  x?: number | null;
  y?: number | null;
  label?: string | null;
  note?: string | null;
}) {
  const [row] = await db.insert(canvasAssets).values(values).returning();
  return row;
}

export async function getCanvasAssetsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(canvasAssets).where(inArray(canvasAssets.id, ids));
}

export async function getCanvasAssetById(id: string) {
  const [row] = await db
    .select()
    .from(canvasAssets)
    .where(eq(canvasAssets.id, id));
  return row ?? null;
}
