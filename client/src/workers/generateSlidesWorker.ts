import "./envBootstrap";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  GENERATE_SLIDES_QUEUE,
  type GenerateSlidesJobData,
} from "@/lib/jobs/queues";
import { processGenerateSlidesJob } from "@/lib/jobs/processors/generateSlidesJob";
import {
  updateJobRow,
  updateSlideGeneration,
} from "@/lib/db/generations";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is required for the worker");
  process.exit(1);
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<GenerateSlidesJobData>(
  GENERATE_SLIDES_QUEUE,
  async (job) => processGenerateSlidesJob(job),
  { connection, concurrency: 2 },
);

worker.on("failed", async (job, err) => {
  if (!job?.data) return;
  const msg = err instanceof Error ? err.message : String(err);
  await updateSlideGeneration(job.data.generationId, {
    status: "failed",
    errorMessage: msg,
  });
  await updateJobRow(job.data.jobRowId, { status: "failed", progress: 0 });
});

worker.on("completed", () => {
  /* noop */
});

console.info(`Worker listening on queue "${GENERATE_SLIDES_QUEUE}"`);
