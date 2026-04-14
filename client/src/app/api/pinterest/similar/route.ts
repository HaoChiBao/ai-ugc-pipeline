import { NextResponse } from "next/server";

function testScriptsBase(): string {
  return (
    process.env.TEST_SCRIPTS_API_URL?.trim() ||
    process.env.TEST_SCRIPTS_API_BASE?.trim() ||
    "http://127.0.0.1:8765"
  );
}

type FastApiPinterestOk = {
  job_id: string;
  files?: Array<{ path: string; media_type?: string | null }>;
  pinterest_links_file?: string | null;
};

function mapSavedFilesToPinUrls(linksFile: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!linksFile?.trim()) return map;
  for (const line of linksFile.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.toLowerCase().startsWith("saved_file")) continue;
    const parts = t.split("\t");
    if (parts.length < 3) continue;
    const saved = parts[0].trim();
    const pinUrl = parts[2].trim();
    if (!saved || !pinUrl) continue;
    map.set(saved, pinUrl);
    const slash = saved.lastIndexOf("/");
    const base = slash >= 0 ? saved.slice(slash + 1) : saved;
    if (base) map.set(base, pinUrl);
  }
  return map;
}

function formatFastApiError(payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const d = (payload as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    try {
      return JSON.stringify(d);
    } catch {
      return "Request failed";
    }
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return "Request failed";
  }
}

/**
 * Calls the test_scripts FastAPI Pinterest downloader: related pins for a pin URL,
 * or image results for a plain-text search query (same `query` field upstream).
 */
export async function POST(req: Request) {
  let body: { url?: string; query?: string; count?: number };
  try {
    body = (await req.json()) as { url?: string; query?: string; count?: number };
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

  const base = testScriptsBase();
  const upstream = await fetch(`${base.replace(/\/$/, "")}/v1/pinterest/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, count }),
  });

  const rawText = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    data = { raw: rawText };
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: formatFastApiError(data),
        upstreamStatus: upstream.status,
      },
      { status: 502 },
    );
  }

  const ok = data as FastApiPinterestOk;
  const jobId = ok.job_id;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json(
      { error: "FastAPI response missing job_id" },
      { status: 502 },
    );
  }

  const files = (ok.files ?? []).filter(
    (f) =>
      (f.media_type && String(f.media_type).startsWith("image/")) ||
      /\.(jpe?g|png|gif|webp)$/i.test(f.path),
  );

  const linkMap = mapSavedFilesToPinUrls(ok.pinterest_links_file);

  const images = files.map((f) => {
    const slash = f.path.lastIndexOf("/");
    const base = slash >= 0 ? f.path.slice(slash + 1) : f.path;
    const pinUrl = linkMap.get(f.path) ?? linkMap.get(base) ?? "";
    return {
      path: f.path,
      pinUrl,
      url: `/api/pinterest/artifact?jobId=${encodeURIComponent(jobId)}&path=${encodeURIComponent(f.path)}`,
    };
  });

  return NextResponse.json({ jobId, images });
}
