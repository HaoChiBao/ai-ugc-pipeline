import { NextResponse } from "next/server";

export const runtime = "nodejs";

function allowedImageFetchHost(host: string): boolean {
  const h = host.toLowerCase();
  if (
    h === "pinimg.com" ||
    h.endsWith(".pinimg.com") ||
    h.includes("pinterest.com") ||
    h === "pin.it" ||
    h.endsWith(".pin.it")
  ) {
    return true;
  }
  /* TikTok oEmbed thumbnails (CDN hosts vary by region) */
  if (h.includes("tiktokcdn")) return true;
  if (h.endsWith(".tiktok.com") || h === "tiktok.com") return true;
  if (h.includes("ttwstatic")) return true;
  if (h.includes("muscdn")) return true;
  return false;
}

function refererForHost(host: string): string {
  const h = host.toLowerCase();
  if (
    h.includes("tiktokcdn") ||
    h.endsWith(".tiktok.com") ||
    h === "tiktok.com" ||
    h.includes("ttwstatic") ||
    h.includes("muscdn")
  ) {
    return "https://www.tiktok.com/";
  }
  return "https://www.pinterest.com/";
}

/**
 * Server-side fetch for Pinterest and TikTok CDN thumbnails (avoids browser
 * CORS when building slideshow multipart uploads from preview URLs).
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Invalid scheme" }, { status: 400 });
  }
  if (!allowedImageFetchHost(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  const res = await fetch(target.toString(), {
    headers: {
      Referer: refererForHost(target.hostname),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 },
    );
  }
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  if (!ct.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 400 });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=300",
    },
  });
}
