import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  getLocalStorageRoot,
  isLocalFileStorage,
  verifyLocalSignedUrl,
} from "@/lib/storage/localFs";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> },
) {
  if (!isLocalFileStorage()) {
    return NextResponse.json(
      { error: "Local file storage is not enabled" },
      { status: 503 },
    );
  }

  const { bucket, path: segments } = await ctx.params;
  const rel = (segments ?? []).join("/");
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const url = new URL(req.url);
  if (process.env.LOCAL_STORAGE_SIGNING_SECRET?.trim()) {
    const ok = verifyLocalSignedUrl(
      bucket,
      rel,
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
    );
    if (!ok) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }
  }

  const root = getLocalStorageRoot();
  const safeBucket = bucket.replace(/[^a-zA-Z0-9._-]/g, "");
  const full = path.join(root, safeBucket, rel);
  const resolvedRoot = path.resolve(root, safeBucket);
  if (!full.startsWith(resolvedRoot)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buf = await fs.readFile(full);
    const ext = path.extname(rel).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "application/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
