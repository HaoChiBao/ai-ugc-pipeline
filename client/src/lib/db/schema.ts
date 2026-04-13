import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  title: text("title").notNull().default("Untitled"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const canvasAssets = pgTable("canvas_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  bucket: text("bucket").notNull(),
  storagePath: text("storage_path").notNull(),
  publicUrl: text("public_url"),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  x: integer("x"),
  y: integer("y"),
  label: text("label"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const slideGenerations = pgTable("slide_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull(),
  stylePreset: text("style_preset"),
  tone: text("tone"),
  slideCount: integer("slide_count"),
  generateVisuals: boolean("generate_visuals").notNull().default(false),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  rawRequestJson: jsonb("raw_request_json"),
  rawResponseJson: jsonb("raw_response_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const slides = pgTable("slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => slideGenerations.id, { onDelete: "cascade" }),
  slideOrder: integer("slide_order").notNull(),
  purpose: text("purpose").notNull(),
  headline: text("headline").notNull(),
  body: text("body"),
  microcopy: text("microcopy"),
  visualType: text("visual_type").notNull(),
  visualPrompt: text("visual_prompt"),
  sourceAssetIdsJson: jsonb("source_asset_ids_json"),
  generatedAssetId: uuid("generated_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const generatedAssets = pgTable("generated_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => slideGenerations.id, { onDelete: "cascade" }),
  slideId: uuid("slide_id"),
  provider: text("provider").notNull(),
  bucket: text("bucket").notNull(),
  storagePath: text("storage_path").notNull(),
  publicUrl: text("public_url"),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  promptUsed: text("prompt_used"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const captionPackages = pgTable("caption_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => slideGenerations.id, { onDelete: "cascade" }),
  caption: text("caption").notNull(),
  cta: text("cta"),
  hashtagsJson: jsonb("hashtags_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => slideGenerations.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  bullmqJobId: text("bullmq_job_id"),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  payloadJson: jsonb("payload_json"),
  resultJson: jsonb("result_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type CanvasAsset = typeof canvasAssets.$inferSelect;
export type SlideGeneration = typeof slideGenerations.$inferSelect;
export type SlideRow = typeof slides.$inferSelect;
export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type CaptionPackage = typeof captionPackages.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
