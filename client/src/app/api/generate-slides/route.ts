import { NextResponse } from "next/server";
import { enrichAndSanitizeRequest } from "@/lib/ai/context/enrichGenerationRequest";
import {
  insertJobRow,
  insertSlideGeneration,
  updateJobRow,
  updateSlideGeneration,
} from "@/lib/db/generations";
import { ensureDefaultProject } from "@/lib/db/projects";
import { getServerEnv } from "@/lib/env/server";
import { getGenerateSlidesQueue } from "@/lib/jobs/queues";
import { runGenerateSlidesPipelineInline } from "@/lib/jobs/runGenerateSlidesPipeline";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodyObj = body as { projectId?: string };
  let projectId = bodyObj.projectId;
  if (!projectId) {
    projectId = await ensureDefaultProject();
  }

  let enriched;
  try {
    enriched = await enrichAndSanitizeRequest(projectId, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const gen = await insertSlideGeneration({
    projectId,
    prompt: enriched.theme,
    mode: enriched.mode,
    stylePreset: enriched.stylePreset ?? null,
    tone: enriched.tone ?? null,
    slideCount: enriched.slideCount ?? null,
    generateVisuals: Boolean(enriched.generateVisuals),
    rawRequestJson: enriched as unknown as Record<string, unknown>,
    status: env.ENABLE_ASYNC_GENERATION ? "queued" : "running",
  });

  const jobRow = await insertJobRow({
    generationId: gen.id,
    jobType: "generate_slides",
    status: env.ENABLE_ASYNC_GENERATION ? "queued" : "running",
    progress: 0,
    payloadJson: { generationId: gen.id },
  });

  try {
    if (env.ENABLE_ASYNC_GENERATION) {
      const q = getGenerateSlidesQueue();
      const bullJob = await q.add(
        "run",
        { generationId: gen.id, jobRowId: jobRow.id },
        { jobId: gen.id },
      );
      await updateJobRow(jobRow.id, {
        bullmqJobId: String(bullJob.id),
      });
      return NextResponse.json({
        generationId: gen.id,
        jobId: jobRow.id,
        bullmqJobId: String(bullJob.id),
        status: "queued",
      });
    }

    await runGenerateSlidesPipelineInline({
      generationId: gen.id,
      jobRowId: jobRow.id,
    });
    return NextResponse.json({
      generationId: gen.id,
      jobId: jobRow.id,
      status: "completed",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generation failed";
    await updateSlideGeneration(gen.id, {
      status: "failed",
      errorMessage: msg,
    });
    await updateJobRow(jobRow.id, { status: "failed", progress: 0 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
