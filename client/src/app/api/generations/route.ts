import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { listSlideGenerationsByProject } from "@/lib/db/generations";
import { ensureDefaultProject } from "@/lib/db/projects";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!env.ENABLE_GENERATION_HISTORY) {
    return NextResponse.json({ error: "History disabled" }, { status: 403 });
  }

  const url = new URL(req.url);
  const projectId =
    url.searchParams.get("projectId") ?? (await ensureDefaultProject());

  const rows = await listSlideGenerationsByProject(projectId, 30);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      theme: r.prompt,
      prompt: r.prompt,
      createdAt: r.createdAt,
      slideCount: r.slideCount,
    })),
  });
}
