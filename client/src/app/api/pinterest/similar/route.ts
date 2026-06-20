import { NextResponse } from "next/server";
import { fetchPinterestSimilarImages } from "@/lib/pinterest/pinterestWebApi";

export const runtime = "nodejs";
/** Pinterest session + feed can take several upstream round-trips. */
export const maxDuration = 60;

function imageProxyUrl(imageUrl: string): string {
  return `/api/pinterest/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Related pins for a pin URL, or keyword search results for plain text.
 * Runs server-side inside this Next.js deployment (no external Python service).
 */
export async function POST(req: Request) {
  let body: { url?: string; query?: string; count?: number };
  try {
    body = (await req.json()) as {
      url?: string;
      query?: string;
      count?: number;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fromQuery = typeof body.query === "string" ? body.query.trim() : "";
  const fromUrl = typeof body.url === "string" ? body.url.trim() : "";
  const q = fromQuery || fromUrl;
  if (!q) {
    return NextResponse.json(
      { error: "Missing query or url (pin URL, pin.it link, or search phrase)" },
      { status: 400 },
    );
  }

  const count = Math.min(24, Math.max(1, Number(body.count) || 12));

  try {
    const rows = await fetchPinterestSimilarImages(q, count);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No similar pins found for this query" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      images: rows.map((row) => ({
        path: row.pinId,
        pinUrl: row.pinUrl,
        url: imageProxyUrl(row.imageUrl),
      })),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Pinterest fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
