import { NextResponse } from "next/server";
import { normalizeTikTokUrl } from "@/lib/url-nodes/tiktok/validateTikTokUrl";

/** TikTok/CDN often reject requests without a browser-like User-Agent. */
const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.tiktok.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
} as const;

function fallbackPayload(canonicalUrl: string) {
  let handle: string | null = null;
  try {
    const m = canonicalUrl.match(/tiktok\.com\/@([^/]+)/i);
    if (m?.[1]) handle = decodeURIComponent(m[1]);
  } catch {
    /* noop */
  }
  return {
    title: "TikTok",
    thumbnailUrl: null as string | null,
    authorName: handle,
    previewLimited: true,
  };
}

/**
 * Server-side TikTok oEmbed proxy (avoids browser CORS on tiktok.com).
 * Some URLs (e.g. /photo/ posts) may not return oEmbed; we then respond with a minimal card.
 * @see https://developers.tiktok.com/doc/embed-videos/
 */
export async function GET(req: Request) {
  const urlParam = new URL(req.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const canonical = normalizeTikTokUrl(urlParam);
  if (!canonical) {
    return NextResponse.json({ error: "Invalid TikTok URL" }, { status: 400 });
  }

  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`;

  try {
    const upstream = await fetch(oembedUrl, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(fallbackPayload(canonical));
    }

    const data = (await upstream.json()) as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };

    return NextResponse.json({
      title: data.title?.trim() || "TikTok",
      thumbnailUrl: data.thumbnail_url ?? null,
      authorName: data.author_name?.trim() ?? null,
    });
  } catch {
    return NextResponse.json(fallbackPayload(canonical));
  }
}
