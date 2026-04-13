import { NextResponse } from "next/server";

export const runtime = "nodejs";

function errorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Slide generation failed";
  const d = data as { detail?: unknown; error?: unknown };
  if (typeof d.error === "string") return d.error;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    const first = d.detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg;
  }
  return "Slide generation failed";
}

/** Proxies multipart form to the FastAPI slide-gen-service (no DB). */
export async function POST(req: Request) {
  const base =
    process.env.SLIDE_GEN_SERVICE_URL?.trim() || "http://127.0.0.1:8000";
  const url = `${base.replace(/\/$/, "")}/v1/generate-slides`;

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
      { error: errorMessage(data) },
      { status: res.status },
    );
  }

  return NextResponse.json(data);
}
