import type { TikTokPreviewPayload } from "./types";

export class TikTokPreviewError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "TikTokPreviewError";
  }
}

export async function fetchTikTokPreview(
  canonicalUrl: string,
): Promise<TikTokPreviewPayload> {
  const res = await fetch(
    `/api/tiktok/oembed?url=${encodeURIComponent(canonicalUrl)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : "Could not load TikTok preview";
    throw new TikTokPreviewError(msg, res.status);
  }
  return res.json() as Promise<TikTokPreviewPayload>;
}
