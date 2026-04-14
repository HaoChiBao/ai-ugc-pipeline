import { NextResponse } from "next/server";

function testScriptsBase(): string {
  return (
    process.env.TEST_SCRIPTS_API_URL?.trim() ||
    process.env.TEST_SCRIPTS_API_BASE?.trim() ||
    "http://127.0.0.1:8765"
  );
}

/** Hex job id from our FastAPI api_runs layout */
const JOB_ID_RE = /^[a-f0-9]{32}$/;

/** Relative path under job folder (no traversal). */
const REL_PATH_RE = /^[\w./-]+$/;

/**
 * Proxies an image from test_scripts FastAPI static `/runs/{jobId}/{path}` so the browser
 * can load it same-origin.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId")?.trim() ?? "";
  const path = searchParams.get("path")?.trim() ?? "";

  if (!JOB_ID_RE.test(jobId) || !REL_PATH_RE.test(path) || path.includes("..")) {
    return NextResponse.json({ error: "Invalid jobId or path" }, { status: 400 });
  }

  const base = testScriptsBase().replace(/\/$/, "");
  const segments = path.split("/").map(encodeURIComponent).join("/");
  const upstreamUrl = `${base}/runs/${jobId}/${segments}`;

  try {
    const res = await fetch(upstreamUrl, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "application/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
