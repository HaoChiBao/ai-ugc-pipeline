import "server-only";

import type { Job } from "bullmq";
import { processGenerateSlidesJob } from "@/lib/jobs/processors/generateSlidesJob";
import type { GenerateSlidesJobData } from "@/lib/jobs/queues";

/** Run slideshow pipeline without BullMQ (ENABLE_ASYNC_GENERATION=false). */
export async function runGenerateSlidesPipelineInline(
  data: GenerateSlidesJobData,
) {
  const job = {
    id: "inline",
    data,
    updateProgress: async () => {},
  } as unknown as Job<GenerateSlidesJobData>;
  return processGenerateSlidesJob(job);
}
