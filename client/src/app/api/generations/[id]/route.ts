import { NextResponse } from "next/server";
import { assembleCompletedGeneration } from "@/lib/generation/assembleClientResult";
import {
  getJobByGenerationId,
  getSlideGenerationById,
} from "@/lib/db/generations";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const gen = await getSlideGenerationById(id);
  if (!gen) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await getJobByGenerationId(id);
  let result = null;
  if (gen.status === "completed") {
    result = await assembleCompletedGeneration(id);
  }

  return NextResponse.json({
    generation: {
      id: gen.id,
      projectId: gen.projectId,
      status: gen.status,
      errorMessage: gen.errorMessage,
      /** User theme/topic (same value as legacy `prompt` column). */
      theme: gen.prompt,
      prompt: gen.prompt,
      mode: gen.mode,
      slideCount: gen.slideCount,
      generateVisuals: gen.generateVisuals,
      createdAt: gen.createdAt,
      updatedAt: gen.updatedAt,
    },
    job: job
      ? {
          id: job.id,
          status: job.status,
          progress: job.progress,
          bullmqJobId: job.bullmqJobId,
        }
      : null,
    result,
    rawRequestJson: gen.rawRequestJson,
    rawResponseJson: gen.rawResponseJson,
  });
}
