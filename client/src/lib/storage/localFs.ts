import "server-only";

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export function isLocalFileStorage(): boolean {
  return Boolean(process.env.LOCAL_STORAGE_ROOT?.trim());
}

export function getLocalStorageRoot(): string {
  const raw = process.env.LOCAL_STORAGE_ROOT?.trim();
  if (!raw) {
    throw new Error("LOCAL_STORAGE_ROOT is not set");
  }
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function bucketRoot(bucket: string): string {
  const safe = bucket.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) throw new Error("Invalid bucket name");
  return path.join(getLocalStorageRoot(), safe);
}

function objectPath(bucket: string, key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("Invalid storage path");
  }
  return path.join(bucketRoot(bucket), normalized);
}

export async function localUpload(input: {
  bucket: string;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}): Promise<void> {
  const target = objectPath(input.bucket, input.path);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buf = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
  await fs.writeFile(target, buf);
}

export async function localRemove(bucket: string, key: string): Promise<void> {
  const target = objectPath(bucket, key);
  await fs.unlink(target).catch(() => {});
}

export function localPublicUrl(bucket: string, key: string): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  const segments = key.split("/").filter(Boolean);
  const tail = segments.map((s) => encodeURIComponent(s)).join("/");
  return `${appUrl}/api/storage/${encodeURIComponent(bucket)}/${tail}`;
}

/** Short-lived “signed” URL using an HMAC query param (local dev only). */
export async function localSignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const secret = process.env.LOCAL_STORAGE_SIGNING_SECRET?.trim();
  const base = localPublicUrl(bucket, key);
  if (!secret) {
    return base;
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${bucket}:${key}:${exp}`;
  const sig = createHash("sha256")
    .update(`${secret}:${payload}`)
    .digest("hex")
    .slice(0, 32);
  const u = new URL(base);
  u.searchParams.set("exp", String(exp));
  u.searchParams.set("sig", sig);
  return u.toString();
}

export function verifyLocalSignedUrl(
  bucket: string,
  key: string,
  exp: string | null,
  sig: string | null,
): boolean {
  const secret = process.env.LOCAL_STORAGE_SIGNING_SECRET?.trim();
  if (!secret) return true;
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const payload = `${bucket}:${key}:${exp}`;
  const want = createHash("sha256")
    .update(`${secret}:${payload}`)
    .digest("hex")
    .slice(0, 32);
  return sig === want;
}

export async function localDownload(
  bucket: string,
  key: string,
): Promise<{ data: Blob; contentType: string | null }> {
  const target = objectPath(bucket, key);
  const buf = await fs.readFile(target);
  const ext = path.extname(key).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "application/octet-stream";
  return { data: new Blob([buf], { type: mime }), contentType: mime };
}
