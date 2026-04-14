import { NextResponse } from "next/server";

export const runtime = "nodejs";

function testScriptsBase(): string {
  return (
    process.env.TEST_SCRIPTS_API_URL?.trim() ||
    process.env.TEST_SCRIPTS_API_BASE?.trim() ||
    "http://127.0.0.1:8765"
  );
}

/** Proxies GET /runs/<jobId>/... from the test_scripts FastAPI static mount. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string; path?: string[] }> },
) {
  const { jobId, path: segments } = await ctx.params;
  if (!jobId || jobId.includes("..") || jobId.includes("/")) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const rel = (segments ?? []).join("/");
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const base = testScriptsBase().replace(/\/$/, "");
  const upstream = `${base}/runs/${encodeURIComponent(jobId)}/${rel
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/")}`;

  const res = await fetch(upstream);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Artifact not found" },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=60",
    },
  });
}
