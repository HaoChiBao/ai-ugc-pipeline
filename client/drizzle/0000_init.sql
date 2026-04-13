CREATE TABLE "canvas_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"x" integer,
	"y" integer,
	"label" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caption_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"caption" text NOT NULL,
	"cta" text,
	"hashtags_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"slide_id" uuid,
	"provider" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"prompt_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"bullmq_job_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"payload_json" jsonb,
	"result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slide_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"mode" text NOT NULL,
	"style_preset" text,
	"tone" text,
	"slide_count" integer,
	"generate_visuals" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"raw_request_json" jsonb,
	"raw_response_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"slide_order" integer NOT NULL,
	"purpose" text NOT NULL,
	"headline" text NOT NULL,
	"body" text,
	"microcopy" text,
	"visual_type" text NOT NULL,
	"visual_prompt" text,
	"source_asset_ids_json" jsonb,
	"generated_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvas_assets" ADD CONSTRAINT "canvas_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_packages" ADD CONSTRAINT "caption_packages_generation_id_slide_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."slide_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_generation_id_slide_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."slide_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_generation_id_slide_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."slide_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_generations" ADD CONSTRAINT "slide_generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_generation_id_slide_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."slide_generations"("id") ON DELETE cascade ON UPDATE no action;