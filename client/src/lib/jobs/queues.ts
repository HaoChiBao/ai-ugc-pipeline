import "server-only";

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getServerEnv } from "@/lib/env/server";

export const GENERATE_SLIDES_QUEUE = "generate-slides";

const globalForRedis = globalThis as unknown as {
  bullConnection?: IORedis;
  generateQueue?: Queue;
};

export function getBullConnection(): IORedis {
  if (globalForRedis.bullConnection) return globalForRedis.bullConnection;
  const env = getServerEnv();
  const url = env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  const conn = new IORedis(url, { maxRetriesPerRequest: null });
  globalForRedis.bullConnection = conn;
  return conn;
}

export function getGenerateSlidesQueue(): Queue {
  if (globalForRedis.generateQueue) return globalForRedis.generateQueue;
  const q = new Queue(GENERATE_SLIDES_QUEUE, {
    connection: getBullConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
  globalForRedis.generateQueue = q;
  return q;
}

export type GenerateSlidesJobData = {
  generationId: string;
  jobRowId: string;
};
