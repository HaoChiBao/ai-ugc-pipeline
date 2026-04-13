import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  isLocalFileStorage,
  localDownload,
  localPublicUrl,
  localRemove,
  localSignedUrl,
  localUpload,
} from "@/lib/storage/localFs";

export function assertStorageConfigured(): void {
  if (isLocalFileStorage()) return;
  getSupabaseAdmin();
}

export function canvasAssetPath(projectId: string, assetId: string, ext: string) {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "png";
  return `${projectId}/${assetId}.${safeExt}`;
}

export function generatedAssetPath(
  projectId: string,
  generationId: string,
  slideId: string,
  ext = "png",
) {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "png";
  return `${projectId}/${generationId}/${slideId}.${safeExt}`;
}

export async function uploadBufferToBucket(input: {
  bucket: string;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}) {
  if (isLocalFileStorage()) {
    await localUpload(input);
    return;
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(input.bucket).upload(input.path, input.body, {
    contentType: input.contentType,
    upsert: input.upsert ?? true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function removeObject(bucket: string, path: string) {
  if (isLocalFileStorage()) {
    await localRemove(bucket, path);
    return;
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage remove failed: ${error.message}`);
}

export function getPublicUrlForPath(bucket: string, path: string): string | null {
  if (isLocalFileStorage()) {
    return localPublicUrl(bucket, path);
  }
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (isLocalFileStorage()) {
    return localSignedUrl(bucket, path, expiresInSeconds);
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create signed URL");
  }
  return data.signedUrl;
}

export async function downloadStorageObject(
  bucket: string,
  path: string,
): Promise<{ data: Blob; contentType: string | null }> {
  if (isLocalFileStorage()) {
    return localDownload(bucket, path);
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "Download failed");
  }
  return { data, contentType: data.type || null };
}
