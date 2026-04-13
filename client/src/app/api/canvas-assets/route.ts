import { NextResponse } from "next/server";
import { insertCanvasAsset } from "@/lib/db/assets";
import { ensureDefaultProject, getProjectById } from "@/lib/db/projects";
import {
  assertStorageConfigured,
  canvasAssetPath,
  uploadBufferToBucket,
} from "@/lib/storage/supabaseStorage";
import sharp from "sharp";

export const runtime = "nodejs";

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "bin";
}

export async function POST(req: Request) {
  try {
    assertStorageConfigured();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Storage not configured (set LOCAL_STORAGE_ROOT or Supabase)";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const bucket =
    process.env.SUPABASE_STORAGE_CANVAS_BUCKET?.trim() || "canvas-assets";
  const form = await req.formData();
  const file = form.get("file");
  const projectIdRaw = form.get("projectId");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const projectId =
    typeof projectIdRaw === "string" && projectIdRaw
      ? projectIdRaw
      : await ensureDefaultProject();

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(buf).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    /* optional */
  }

  const row = await insertCanvasAsset({
    projectId,
    bucket,
    storagePath: "pending",
    publicUrl: null,
    mimeType,
    width,
    height,
    x: num(form.get("x")),
    y: num(form.get("y")),
    label: str(form.get("label")),
    note: str(form.get("note")),
  });

  const ext = extFromMime(mimeType);
  const path = canvasAssetPath(projectId, row.id, ext);

  await uploadBufferToBucket({
    bucket,
    path,
    body: buf,
    contentType: mimeType,
    upsert: true,
  });

  const { db } = await import("@/lib/db/index");
  const { canvasAssets } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(canvasAssets)
    .set({ storagePath: path })
    .where(eq(canvasAssets.id, row.id));

  return NextResponse.json({
    id: row.id,
    projectId,
    storagePath: path,
    bucket,
    mimeType,
    width,
    height,
  });
}

function str(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

function num(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
