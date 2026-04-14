import { NextResponse } from "next/server";

export const runtime = "nodejs";

function testScriptsBase(): string {
  return (
    process.env.TEST_SCRIPTS_API_URL?.trim() ||
    process.env.TEST_SCRIPTS_API_BASE?.trim() ||
    "http://127.0.0.1:8765"
  );
}

function formatError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Slideshow request failed";
  const d = payload as { detail?: unknown; error?: unknown };
  if (typeof d.error === "string") return d.error;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    const first = d.detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg;
  }
  return "Slideshow request failed";
}

/** Proxies multipart form to FastAPI POST /v1/slideshow/captioned (captioned TikTok runner). */
export async function POST(req: Request) {
  const base = testScriptsBase().replace(/\/$/, "");
  const url = `${base}/v1/slideshow/captioned`;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: formatError(data) },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json(data);
}
