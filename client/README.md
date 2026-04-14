# AI UGC Canvas + AI Studio

Next.js app with an infinite canvas for reference images and an **AI Studio** panel for TikTok-style slideshow generation (planning, slide copy, optional Gemini visuals, caption package).

## Theme-first slideshow generation

- The user enters a **short theme or topic** (e.g. “Top 5 running tips”) — not a slide-by-slide manual spec.
- **OpenAI** expands the theme into a structured plan: title, strategy, slide sequence, captions, visual directions, caption package, and optional `continuityNotes` for a cohesive story.
- Prompts live in `src/lib/ai/prompts/runtimePipelinePrompt.ts` (runtime pipeline) and `src/lib/ai/prompts/systemPrompt.ts` (JSON guardrails).
- **Canvas reference images** are sent as asset summaries; when “use selected references” is on, those UUIDs are merged into Gemini image calls for style consistency.
- **Gemini** generates vertical slide images when enabled; `src/lib/ai/prompts/imageGenerationMasterPrompt.ts` enforces a **cohesive TikTok slideshow sequence** (same aesthetic, varied shots). The job processor merges planner `recommendedReferenceAssetIds` with selected canvas IDs so references always reach the image model when requested.
- Results are persisted on `slide_generations` / `slides` / `caption_packages`; optional assets go to Supabase Storage (or `LOCAL_STORAGE_ROOT`). **BullMQ + Redis** runs the pipeline asynchronously when `ENABLE_ASYNC_GENERATION=true`; otherwise the same code runs inline.

## Prerequisites

- **Node.js** 20+
- **Supabase** project (Postgres + Storage) — recommended for production-like dev
- **Redis** with the TCP protocol (for BullMQ) when `ENABLE_ASYNC_GENERATION=true`. REST-only Redis (e.g. Upstash HTTP) is not compatible with BullMQ.
- **OpenAI** API key
- **Google Gemini** API key only if `ENABLE_GEMINI_IMAGE_GEN=true` and you generate slide images

## Supabase (database + storage)

1. Create a project at [supabase.com](https://supabase.com). In **Connect**, copy the **Transaction** pooler URI (or use `DATABASE_URL` with `[DB_PASSWORD]` + `DB_PASSWORD` in `.env`).

2. Set **`SUPABASE_DB_REGION`** to your project region (e.g. `us-west-2`) so `db.*` hostnames can be rewritten to the **session pooler** on IPv4-only networks.

3. In **Storage**, ensure buckets exist (or match env): `canvas-assets`, `generated-assets` (or your `SUPABASE_STORAGE_*` names).

4. Copy `.env.example` to `.env` / `.env.local` and fill `DATABASE_URL`, `DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Do not set** `LOCAL_STORAGE_ROOT` when using Supabase Storage.

5. Apply DB migrations from `client/`:

   ```bash
   npm run db:migrate
   ```

## Optional: local Postgres + disk storage

For fully offline DB + files: `npm run db:up` (Docker), `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_ugc`, `LOCAL_STORAGE_ROOT=./.local-storage`. See `docker-compose.yml`.

## Environment (summary)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (Supabase URI or local) |
| `LOCAL_STORAGE_ROOT` | If set, uses disk instead of Supabase Storage |
| `OPENAI_API_KEY` | Slide planning & copy |
| `GEMINI_API_KEY` | Generated slide images when `ENABLE_GEMINI_IMAGE_GEN=true` |
| `REDIS_URL` | Required when `ENABLE_ASYNC_GENERATION=true` |
| `ENABLE_ASYNC_GENERATION` | `false` = inline generation, no worker |
| `ENABLE_GEMINI_IMAGE_GEN` | `false` = text-only slideshows |
| `TEST_SCRIPTS_API_URL` | Base URL for the Python FastAPI in `test_scripts` (default `http://127.0.0.1:8765`). Used for Pinterest “similar pins” on the canvas. |

## Run the app

```bash
npm install
npm run dev
```

With BullMQ (`ENABLE_ASYNC_GENERATION=true`):

```bash
npm run worker
```

The worker loads `.env.local` / `.env` via `dotenv-cli`.

## Project layout (high level)

- `src/components/canvas/` — infinite canvas
- `src/components/ai-studio/` — prompt, controls, progress, results
- `src/lib/ai/` — OpenAI prompts, Zod schemas, agents
- `src/lib/images/` — Gemini-backed `ImageGenerationProvider`
- `src/lib/jobs/` — BullMQ queue + `generateSlides` processor
- `src/lib/db/` — Drizzle schema + helpers
- `src/lib/storage/` — Supabase Storage or local disk (`localFs.ts`)
- `src/workers/generateSlidesWorker.ts` — queue consumer entrypoint

## API routes

- `POST /api/canvas-assets` — multipart image upload → storage + `canvas_assets` row
- `GET /api/storage/[bucket]/[...path]` — serve files when `LOCAL_STORAGE_ROOT` is set
- `POST /api/generate-slides` — validate request, persist generation, enqueue job (or run inline)
- `GET /api/generations/[id]` — status, job progress, structured result when complete
- `GET /api/generations` — history (requires `ENABLE_GENERATION_HISTORY=true`)
- `GET /api/projects/ensure` — ensure a default `projects` row for anonymous workflows (not `/default` — that segment name is reserved in the App Router)

## Canvas selection (Figma-style)

- **Click** an object to make it the only selection.
- **Shift+click** (or Ctrl/Cmd+click) toggles membership in the selection.
- **Click** an already-selected object when multiple are selected keeps the group (so you can drag them together).
- **Drag** on empty canvas to **marquee** (box) select; hold **Shift** while finishing the box to add to the current selection.
- **Click** empty canvas (no drag) clears the selection.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
