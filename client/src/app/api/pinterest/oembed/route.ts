import { NextResponse } from "next/server";

/**
 * Server-side Pinterest oEmbed (avoids browser CORS). Public Pinterest API.
 */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing url query parameter" }, { status: 400 });
  }

  const oembed = new URL("https://www.pinterest.com/oembed.json");
  oembed.searchParams.set("url", url);

  try {
    const res = await fetch(oembed.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Pinterest oEmbed returned ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      thumbnail_url?: string;
      title?: string;
      author_name?: string;
    };
    return NextResponse.json({
      thumbnailUrl: data.thumbnail_url ?? null,
      title: typeof data.title === "string" && data.title ? data.title : "Pinterest",
      authorName: data.author_name ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oEmbed request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
