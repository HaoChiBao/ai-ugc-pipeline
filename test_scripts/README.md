# TikTok slideshow (test scripts)

Caption plans follow a **Hook → Value ladder → Closer** pattern (open loop on slide 1, one beat per middle slide, payoff or soft CTA on the last slide), plus a **per-slide `shot_direction`** so image generation mixes hero frames with B-roll (POV, props, environment). See `tiktok_slideshow_gen/caption_plan_llm.py` for full rules.

## Main workflow: `run_slideshow_gen.py`

**No AI image generation.** The script:

1. Calls **OpenAI** (default) or **Gemini** (`--provider gemini`) to produce a JSON plan: **theme**, **slide count**, **caption** plus **shot_direction** per slide (image brief: hero vs B-roll, POV, props, environment). The model uses a fixed **TikTok motivation core** system prompt (tone + format + shot mix rules); see `tiktok_slideshow_gen/caption_plan_llm.py` (`TIKTOK_MOTIVATION_CORE_SYSTEM_PROMPT`).
2. **Randomly picks** that many files from **`input_text_images/`** (repeats allowed if the folder is smaller than the slide count).
3. Draws **TikTok-style text** on each image — **always horizontally centered**; **vertical** position varies per slide by default (see `--fixed-layout`). Outputs **`output_captioned_images/slide_01.png`**, … plus **`caption_manifest.json`**.

Put your photos in **`input_text_images/`**. Set **`OPENAI_API_KEY`** in `.env` (see `.env.example`).

```bash
cd test_scripts
.venv\Scripts\activate
pip install -r requirements.txt
python run_slideshow_gen.py "Top 5 running tips for beginners"
# Black text on fused white rounded labels (see tiktok_label_overlay.py):
python run_slideshow_gen.py "Your topic" --caption-style label
```

`run_captioned_slideshow.py` is the **same behavior** (alias).

### CLI options

```text
--provider openai|gemini   Default: openai
--model MODEL              Override OPENAI_MODEL or GEMINI_TEXT_MODEL
--input-dir PATH           Default: ./input_text_images
--output-dir PATH          Default: ./output_captioned_images
--seed N                   Reproducible random image picks
--fixed-layout             One position for all slides (uses anchors/margins below)
--placement-seed N         Reproducible per-slide placement when varying (optional)

--v-anchor --h-anchor      Used with --fixed-layout (top/center/bottom, left/center/right)
--shift-x --shift-y        Nudge caption block (--fixed-layout)
--margin-x --margin-y      Edge margins (--fixed-layout)
--font-size-ratio          Center size when varying; exact size when --fixed-layout
--no-shadow                Stroke style only
--caption-style stroke|label   stroke = outline text (default); label = white pills + black text
--no-label-lowercase       With label style: keep Aa casing (default: lowercase)
```

By default, **each slide** gets **vertical** variety (anchor + nudge + margins); **font size** is **fixed** to `--font-size-ratio`. **Horizontal** is always **center**. After layout, captions are **clamped** so they never sit flush on the absolute top/bottom (safe vertical band). Use **`--fixed-layout`** for one vertical position on every slide (`--h-anchor` and `--shift-x` are ignored).

### Environment

| Variable | When |
|----------|------|
| `OPENAI_API_KEY` | Default `--provider openai` |
| `OPENAI_MODEL` | Optional (e.g. `gpt-4.1-mini`) |
| `GEMINI_API_KEY` | `--provider gemini` for captions only |
| `GEMINI_TEXT_MODEL` | Optional text model for captions |
| `TIKTOK_FONT_PATH` | Optional bold `.ttf` for overlay |

Load order: `test_scripts/.env`, then `client/.env`.

---

## TikTok-style text on a single image

```bash
python run_text_overlay.py path/to/photo.jpg "Your caption" -o out.png --v-anchor bottom --shift-y -0.05
```

Modules: `tiktok_slideshow_gen/tiktok_text_overlay.py` (stroke), `tiktok_slideshow_gen/tiktok_label_overlay.py` (label).

---

## Full pipeline: OpenAI plan + Gemini images + text (`finished_slides/`)

**`run_tiktok_themed_slide_pipeline.py`** combines:

1. **OpenAI** – same JSON plan as `run_slideshow_gen` (**Hook / Value / Closer** captions + `theme_title`, `theme_description`, `num_slides`).
2. **7 reference images** from **`input_images/`** by default (override with **`--ref-count N`**; max 16). Default **`--ref-mode random`**; **`--ref-mode first`** takes the first N sorted names; **`--seed`** fixes random picks for reproducibility.
3. **Gemini** – one image per slide from the **same reference set**; prompts ask for **reference-grounded** shots (same subject/session feel, **small** face/wardrobe/pose tweaks), **strong cross-slide consistency**, and **scene variety** (e.g. running: track, motion blur, wide shots). Captions are **not** painted into pixels.
4. **Overlay** – **always** **white text + black outline** (stroke), transparent (no white pill boxes); drop shadow is **off** by default (use **`--stroke-shadow`** if you want one). OpenAI captions: **no em dashes**, **no trailing periods**. Saves **`finished_slides/slide_01.png`**, … and **`slide_pipeline_manifest.json`**. Optional **`--keep-raw`** keeps Gemini outputs in **`finished_slides/_raw/`**.

Needs **`OPENAI_API_KEY`** and **`GEMINI_API_KEY`**.

```bash
python run_tiktok_themed_slide_pipeline.py "Your TikTok topic"
```

---

## Photoreal batch (Gemini): 3 random refs + prompt to `output_images/`

Uses **three random** files from **`input_images/`** as **style/mood references only** (not blended into one image). Generates **`gen_01.png`**, … in **`output_images/`** with a master prompt that pushes **smartphone camera** realism, same visual language across outputs, and **varied shots** (e.g. different runner, angle, or moment) per frame.

```bash
pip install -r requirements.txt
# GEMINI_API_KEY in .env
python run_photoreal_batch.py "late afternoon run by the water, candid energy" --num-images 4
```

Options: `--seed` (reproducible ref pick), `--model`, `--aspect-ratio`, `--image-size`, `--input-dir`, `--output-dir`.

---

## Optional: Gemini image plumbing

**`tiktok_slideshow_gen/gemini_generate.py`** powers **`run_photoreal_batch.py`** and matches `slide-gen-service`. **`run_slideshow_gen.py`** (caption workflow) does **not** call image generation.

---

## Module map

| Path | Role |
|------|------|
| `run_slideshow_gen.py` | LLM captions + random `input_text_images/` + overlay |
| `run_captioned_slideshow.py` | Same as above |
| `run_tiktok_themed_slide_pipeline.py` | OpenAI plan + N refs (default 7) + Gemini per slide + overlay to `finished_slides/` |
| `run_photoreal_batch.py` | 3 random `input_images/` refs + Gemini photoreal batch to `output_images/gen_*.png` |
| `run_text_overlay.py` | One image + TikTok-style text |
| `tiktok_slideshow_gen/captioned_slideshow_runner.py` | Shared implementation |
| `tiktok_slideshow_gen/caption_plan_llm.py` | OpenAI / Gemini JSON caption plans |
| `tiktok_slideshow_gen/random_image_pool.py` | Random image selection |
| `tiktok_slideshow_gen/text_placement_variety.py` | Random per-slide caption placement |
| `tiktok_slideshow_gen/tiktok_text_overlay.py` | Stroke / shadow caption drawing |
| `tiktok_slideshow_gen/tiktok_label_overlay.py` | White pill + black text label style |
| `tiktok_slideshow_gen/load_images.py` | List/load images |
| `tiktok_slideshow_gen/gemini_generate.py` | Gemini image generation (refs + prompt) |
| `tiktok_slideshow_gen/photoreal_prompts.py` | Photoreal batch prompt text |
| `tiktok_slideshow_gen/themed_slide_gen_prompts.py` | Gemini prompt per slide (plan + caption + phone block) |
| `tiktok_slideshow_gen/prompts.py` | Text prompts for optional Gemini image gen |
