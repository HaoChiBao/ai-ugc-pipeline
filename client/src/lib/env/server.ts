import "server-only";

import { z } from "zod";

function readEnvBool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  return v === "true" || v === "1";
}

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_MAIN: z.string().min(1).default("gpt-4.1"),
  OPENAI_MODEL_FAST: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z
    .string()
    .min(1)
    .default("text-embedding-3-small"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z
    .string()
    .min(1)
    .default("gemini-3-pro-image-preview"),
  GEMINI_IMAGE_FAST_MODEL: z
    .string()
    .min(1)
    .default("gemini-2.5-flash-image"),

  /** Ignored when `USE_LOCAL_POSTGRES=true` (see `LOCAL_DATABASE_URL`). */
  DATABASE_URL: z.string().optional(),
  /** Override default `postgresql://postgres:postgres@localhost:5432/ai_ugc` when `USE_LOCAL_POSTGRES=true`. */
  LOCAL_DATABASE_URL: z.string().optional(),

  REDIS_URL: z.string().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_STORAGE_CANVAS_BUCKET: z.string().min(1).default("canvas-assets"),
  SUPABASE_STORAGE_GENERATED_BUCKET: z
    .string()
    .min(1)
    .default("generated-assets"),

  LOCAL_STORAGE_ROOT: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnvParsed = z.infer<typeof serverEnvSchema>;

export type ServerEnv = ServerEnvParsed & {
  ENABLE_ASYNC_GENERATION: boolean;
  ENABLE_IMAGE_CONTEXT: boolean;
  ENABLE_GENERATION_HISTORY: boolean;
  ENABLE_GEMINI_IMAGE_GEN: boolean;
};

let cached: ServerEnv | null = null;

/** Validated server env. Call from API routes, server actions, workers only. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid server environment: ${JSON.stringify(msg, null, 2)}`,
    );
  }
  const useLocalPostgres = readEnvBool("USE_LOCAL_POSTGRES", false);
  const databaseUrl = useLocalPostgres
    ? (parsed.data.LOCAL_DATABASE_URL?.trim() ||
        "postgresql://postgres:postgres@localhost:5432/ai_ugc")
    : parsed.data.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Set DATABASE_URL, or USE_LOCAL_POSTGRES=true with Docker Postgres (npm run db:up) and optional LOCAL_DATABASE_URL",
    );
  }
  const data: ServerEnv = {
    ...parsed.data,
    DATABASE_URL: databaseUrl,
    ENABLE_ASYNC_GENERATION: readEnvBool("ENABLE_ASYNC_GENERATION", true),
    ENABLE_IMAGE_CONTEXT: readEnvBool("ENABLE_IMAGE_CONTEXT", true),
    ENABLE_GENERATION_HISTORY: readEnvBool("ENABLE_GENERATION_HISTORY", true),
    ENABLE_GEMINI_IMAGE_GEN: readEnvBool("ENABLE_GEMINI_IMAGE_GEN", true),
  };

  if (data.ENABLE_ASYNC_GENERATION && !data.REDIS_URL?.trim()) {
    throw new Error(
      "REDIS_URL is required when ENABLE_ASYNC_GENERATION is true",
    );
  }

  if (data.ENABLE_GEMINI_IMAGE_GEN) {
    const serviceKey =
      data.SUPABASE_SERVICE_ROLE_KEY?.trim() || data.SUPABASE_SECRET_KEY?.trim();
    const hasSupabase =
      Boolean(data.NEXT_PUBLIC_SUPABASE_URL?.trim()) && Boolean(serviceKey);
    const hasLocalStorage = Boolean(data.LOCAL_STORAGE_ROOT?.trim());
    if (!hasSupabase && !hasLocalStorage) {
      throw new Error(
        "When ENABLE_GEMINI_IMAGE_GEN is true, set LOCAL_STORAGE_ROOT (local disk) or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase Storage)",
      );
    }
  }

  if (data.ENABLE_GEMINI_IMAGE_GEN && !data.GEMINI_API_KEY?.trim()) {
    throw new Error(
      "GEMINI_API_KEY is required when ENABLE_GEMINI_IMAGE_GEN is true",
    );
  }

  cached = data;
  return data;
}

/** Use in worker entry to load .env.local in dev */
export function loadEnvFiles() {
  if (process.env.NODE_ENV === "test") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env.local" });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env" });
  } catch {
    /* optional in prod */
  }
}
