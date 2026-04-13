#!/usr/bin/env python3
"""
TikTok slide pipeline (**compose-only**, no Gemini / no AI image generation):

1. **OpenAI** builds the slideshow plan (captions + ``shot_direction`` per slide).
2. **Library:** every image in ``--input-dir`` (non-recursive) plus optional **inspiration** slides from analyzed TikToks.
3. **Match** each planned slide to the best library image using text similarity (``shot_direction`` + caption vs a **scene blob** per image).
4. **Crop** matched images to 9:16, optional downscale, draw **stroke** captions.

**Input vision notes (recommended):** ``--input-vision-dir`` pairs ``<stem>.txt`` from ``categorize_input_images.py`` with images in ``--input-dir``. Those notes become the **scene blob** for matching (no extra OpenAI vision call for that image). Images **without** a paired .txt use **live OpenAI vision** unless ``--no-input-vision`` (filename-only fallback).

**TikTok inspiration (optional):** ``--inspiration-manifest`` / ``--inspiration-dir`` load ``tiktok_slideshow_manifest.json`` for the **caption planner**, and optionally ``slides/*.jpg`` into the library (``--inspiration-slide-limit``; ``0`` = up to 200 slides).

Requires **OPENAI_API_KEY** only. Optional **phone-style grade** on composed slides (``--no-phone-grade`` to skip).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image as PILImage

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.caption_plan_llm import generate_caption_plan_openai
from tiktok_slideshow_gen.compose_library_slides import (
    LibrarySlideAsset,
    assign_library_assets_to_planned_slides,
    inspiration_asset_to_library_asset,
    input_path_to_library_asset_with_notes,
    write_library_frames_to_raw_dir,
)
from tiktok_slideshow_gen.load_images import IMAGE_EXTENSIONS, list_image_paths
from tiktok_slideshow_gen.text_placement_variety import (
    resolve_placement_rng,
    style_to_dict,
    styles_for_slides,
)
from tiktok_slideshow_gen.phone_realism_grade import apply_phone_capture_grade
from tiktok_slideshow_gen.tiktok_analysis_inspiration import (
    InspirationSlideAsset,
    collect_inspiration_posts,
    collect_input_vision_notes,
    format_inspiration_for_openai,
    format_input_vision_for_openai,
    load_inspiration_slide_assets,
)
from tiktok_slideshow_gen.tiktok_text_overlay import TikTokTextStyle, draw_tiktok_text


def _load_env() -> None:
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv(_SCRIPT_DIR.parent / "client" / ".env")


def _library_blob_preview(blob: str, *, max_len: int = 120) -> str:
    t = " ".join((blob or "").split())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def main() -> int:
    _load_env()

    default_in = _SCRIPT_DIR / "input_images"
    default_out = _SCRIPT_DIR / "finished_slides"

    parser = argparse.ArgumentParser(
        description=(
            "OpenAI caption plan + match/crop images from disk + text overlay (no Gemini image generation)."
        ),
    )
    parser.add_argument("prompt", help="TikTok topic / angle (passed to OpenAI caption planner).")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=default_in,
        help=f"Image library folder, non-recursive (default: {default_in})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_out,
        help=f"Finished slides output (default: {default_out})",
    )
    parser.add_argument(
        "--openai-model",
        default=None,
        help="Override OPENAI_MODEL for caption JSON",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Reproducible caption placement when not using --fixed-layout",
    )
    parser.add_argument(
        "--fixed-layout",
        action="store_true",
        help="Single text position for all slides (else vertical variance, centered horizontally)",
    )
    parser.add_argument(
        "--placement-seed",
        type=int,
        default=None,
    )
    parser.add_argument(
        "--font-size-ratio",
        type=float,
        default=0.048,
    )
    parser.add_argument(
        "--stroke-shadow",
        action="store_true",
        help="Stroke only: add offset drop shadow (default is outline-only, no shadow)",
    )
    parser.add_argument(
        "--no-shadow",
        action="store_true",
        help="Stroke only: force no drop shadow (default; overrides --stroke-shadow)",
    )
    parser.add_argument(
        "--keep-raw",
        action="store_true",
        help="Keep 9:16 crops under output_dir/_raw/ (otherwise temp dir is deleted)",
    )
    parser.add_argument(
        "--inspiration-manifest",
        type=Path,
        action="append",
        default=None,
        metavar="PATH",
        help="tiktok_slideshow_manifest.json from analyze_tiktok_slideshow.py (repeatable)",
    )
    parser.add_argument(
        "--inspiration-dir",
        type=Path,
        action="append",
        default=None,
        metavar="PATH",
        help="Directory tree to scan for tiktok_slideshow_manifest.json (repeatable)",
    )
    parser.add_argument(
        "--input-vision-dir",
        type=Path,
        default=None,
        metavar="PATH",
        help=(
            "Folder of per-image .txt notes (categorize_input_images.py): pairs "
            "<stem>.txt with <stem>.* in --input-dir (non-recursive)"
        ),
    )
    parser.add_argument(
        "--inspiration-slide-limit",
        type=int,
        default=8,
        metavar="N",
        help="Max inspiration slide images to load into the library (0-200; 0 means up to 200)",
    )
    parser.add_argument(
        "--no-inspiration-slide-images",
        action="store_true",
        help="Use inspiration manifest text for the planner only; do not load slides/*.jpg into the library",
    )
    parser.add_argument(
        "--no-phone-grade",
        action="store_true",
        help="Skip saturation/contrast grade on each composed slide",
    )
    parser.add_argument(
        "--no-first-slide-person-rule",
        action="store_true",
        help="Allow slide 1 to be B-roll like other slides (default: person-forward hook)",
    )
    parser.add_argument(
        "--no-input-vision",
        action="store_true",
        help=(
            "For input images **without** a paired .txt: do not call OpenAI vision; "
            "use filename-only scene labels"
        ),
    )
    parser.add_argument(
        "--library-vision-model",
        default=None,
        metavar="MODEL",
        help="Override OPENAI_VISION_MODEL for live labeling when no paired .txt (default: env or gpt-4o-mini)",
    )
    parser.add_argument(
        "--library-long-edge",
        type=int,
        default=1920,
        metavar="PX",
        help="After 9:16 crop, downscale if max side exceeds this (default: 1920; set 0 to skip downscale)",
    )

    args = parser.parse_args()
    run_started = time.perf_counter()
    inspiration_manifest_paths = args.inspiration_manifest or []
    inspiration_dir_paths = args.inspiration_dir or []

    slide_limit = args.inspiration_slide_limit
    if slide_limit < 0 or slide_limit > 200:
        print(
            "error: --inspiration-slide-limit must be 0–200 (0 = load up to 200 inspiration slides)",
            file=sys.stderr,
        )
        return 2
    insp_cap = 200 if slide_limit == 0 else slide_limit

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    input_vision_pairs: list[tuple[Path, str]] = []
    if args.input_vision_dir is not None:
        try:
            input_vision_pairs = collect_input_vision_notes(input_dir, args.input_vision_dir)
        except (OSError, FileNotFoundError) as e:
            print(f"error: --input-vision-dir: {e}", file=sys.stderr)
            return 2
        if not input_vision_pairs:
            print(
                "warning: --input-vision-dir set but no matching .txt files "
                "(expect <stem>.txt for each image stem in --input-dir, non-recursive)",
                file=sys.stderr,
            )

    vision_by_path: dict[Path, str] = {p.resolve(): txt for p, txt in input_vision_pairs}

    stroke_drop_shadow = args.stroke_shadow and not args.no_shadow

    inspiration_posts = []
    try:
        inspiration_posts = collect_inspiration_posts(
            manifest_files=inspiration_manifest_paths,
            inspiration_dirs=inspiration_dir_paths,
        )
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"error: inspiration load failed: {e}", file=sys.stderr)
        return 2

    inspiration_openai = format_inspiration_for_openai(inspiration_posts)
    input_vision_openai = format_input_vision_for_openai(input_vision_pairs)

    ref_sections: list[str] = []
    if inspiration_openai.strip():
        ref_sections.append("## Reference TikTok analyses\n" + inspiration_openai.strip())
    if input_vision_openai.strip():
        ref_sections.append("## Reference images (precomputed vision notes)\n" + input_vision_openai.strip())
    inspiration_context = "\n\n".join(ref_sections) if ref_sections else None

    if inspiration_posts and not inspiration_openai.strip():
        print(
            "warning: inspiration manifests loaded but no openai_analysis text to use",
            file=sys.stderr,
        )
    if inspiration_posts:
        print(f"Inspiration: {len(inspiration_posts)} analyzed post(s)")
    if input_vision_pairs:
        print(f"Input vision notes: {len(input_vision_pairs)} image(s) with paired .txt")

    first_slide_person = not args.no_first_slide_person_rule

    print("OpenAI: building caption plan...")
    plan = generate_caption_plan_openai(
        args.prompt,
        model=args.openai_model,
        inspiration_context=inspiration_context,
        first_slide_person_required=first_slide_person,
    )
    n = plan.num_slides
    captions = plan.captions_in_order()
    print(f"  Theme: {plan.theme_title!r} ({n} slide(s))")
    if plan.theme_description:
        print(f"  {plan.theme_description}")
    print("  Planned shots (image briefs):")
    for i, s in enumerate(plan.slides, start=1):
        print(f"    {i}. {s.shot_direction}")

    print(f"Scanning images in {input_dir} (compose-only; no Gemini)...")
    try:
        all_input_paths = list_image_paths(input_dir)
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    ref_paths = list(all_input_paths)
    for p in ref_paths:
        print(f"  input: {p}")

    inspiration_assets: list[InspirationSlideAsset] = []
    if inspiration_posts and not args.no_inspiration_slide_images and insp_cap > 0:
        inspiration_assets = load_inspiration_slide_assets(
            inspiration_posts,
            max_slides_total=insp_cap,
            max_slides_per_post=min(24, insp_cap),
        )
        if inspiration_assets:
            print(
                f"Loading {len(inspiration_assets)} inspiration slide image(s) into library "
                f"(cap={insp_cap})...",
            )
            for a in inspiration_assets:
                print(f"  - {a.path}")

    slide_match_debug: list[dict[str, object]] = []
    assigned_lib: list[tuple[LibrarySlideAsset, float]] = []
    compose_library_manifest: list[dict[str, object]] = []

    library: list[LibrarySlideAsset] = []
    if all_input_paths:
        print(f"Building scene labels for {len(all_input_paths)} input image(s)...")
        for p in all_input_paths:
            pre = vision_by_path.get(p.resolve())
            if pre:
                how = "precomputed .txt"
            elif args.no_input_vision:
                how = "filename fallback"
            else:
                how = "OpenAI vision (no paired .txt)"
            lib_a = input_path_to_library_asset_with_notes(
                p,
                precomputed_scene_text=pre,
                vision_model=args.library_vision_model,
                no_vision=bool(args.no_input_vision),
            )
            library.append(lib_a)
            print(f"  {p.name} [{how}]: {_library_blob_preview(lib_a.scene_blob)}")
    for a in inspiration_assets:
        library.append(inspiration_asset_to_library_asset(a))
    if not library:
        print(
            "error: need at least one library image: add files to --input-dir "
            "and/or load inspiration slides (remove --no-inspiration-slide-images, raise --inspiration-slide-limit).",
            file=sys.stderr,
        )
        return 2
    print(f"Library: {len(library)} image(s) (input + inspiration). Matching to {n} planned slide(s)...")
    try:
        assigned_lib = assign_library_assets_to_planned_slides(plan, library)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    compose_library_manifest = [
        {
            "path": str(x.path),
            "source": x.source,
            "scene_blob": x.scene_blob[:800],
            "categories": list(x.categories),
        }
        for x in library
    ]
    for k, (lib_a, raw_score) in enumerate(assigned_lib, start=1):
        slide_match_debug.append(
            {
                "slide_index": k,
                "mode": "library_compose",
                "source_path": str(lib_a.path),
                "source": lib_a.source,
                "match_score_raw": round(raw_score, 4),
                "scene_blob_preview": _library_blob_preview(lib_a.scene_blob, max_len=200),
                "categories": list(lib_a.categories),
            },
        )
        print(f"  slide {k}: pick {lib_a.source} {lib_a.path.name} (raw match {raw_score:.3f})")

    if args.keep_raw:
        raw_dir = output_dir / "_raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        cleanup_raw: Path | None = None
    else:
        raw_dir = Path(tempfile.mkdtemp(prefix="tiktok_slide_raw_"))
        cleanup_raw = raw_dir

    try:
        le = int(args.library_long_edge)
        if le <= 0:
            le = 65_535
        print("Compose: cropping assigned images to 9:16...")
        raw_paths = write_library_frames_to_raw_dir(
            assigned_lib,
            raw_dir,
            long_edge=le,
        )
        for rp in raw_paths:
            print(f"  - {rp}")

        if args.fixed_layout:
            styles = [
                TikTokTextStyle(
                    vertical_anchor="bottom",
                    horizontal_anchor="center",
                    margin_x_ratio=0.06,
                    margin_y_ratio=0.11,
                    shift_x_ratio=0.0,
                    shift_y_ratio=0.0,
                    font_size_ratio=args.font_size_ratio,
                    fill_color=(255, 255, 255),
                    stroke_color=(0, 0, 0),
                    shadow=stroke_drop_shadow,
                )
            ] * n
        else:
            placement_rng = resolve_placement_rng(
                seed=args.seed,
                placement_seed=args.placement_seed,
            )
            styles = styles_for_slides(
                n,
                placement_rng,
                shadow=stroke_drop_shadow,
                font_size_ratio_center=args.font_size_ratio,
            )

        print("Drawing captions (white text + black outline, no background)...")
        finished_rows: list[dict[str, object]] = []
        for i, (raw_path, caption, style) in enumerate(
            zip(raw_paths, captions, styles),
            start=1,
        ):
            base = PILImage.open(raw_path).convert("RGB")
            if not args.no_phone_grade:
                base = apply_phone_capture_grade(base)
            final_img = draw_tiktok_text(base, caption, style=style)
            out_path = output_dir / f"slide_{i:02d}.png"
            final_img.save(out_path, format="PNG")
            print(f"  {out_path}")
            row: dict[str, object] = {
                "index": i,
                "caption": caption,
                "shot_direction": plan.slides[i - 1].shot_direction,
                "finished": str(out_path),
                "raw_generated": str(raw_path) if args.keep_raw else None,
                "inspiration_match": slide_match_debug[i - 1]
                if i - 1 < len(slide_match_debug)
                else None,
            }
            if not args.fixed_layout:
                row["text_style"] = style_to_dict(style)
            finished_rows.append(row)

    finally:
        if cleanup_raw is not None:
            shutil.rmtree(cleanup_raw, ignore_errors=True)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_prompt": args.prompt,
        "input_vision_dir": str(args.input_vision_dir.resolve()) if args.input_vision_dir else None,
        "input_vision_matched": [p.name for p, _ in input_vision_pairs],
        "pipeline_mode": "compose_library_no_gemini",
        "skip_ai_image_generation": True,
        "no_input_vision": bool(args.no_input_vision),
        "library_vision_model": args.library_vision_model or None,
        "compose_library": compose_library_manifest,
        "library_long_edge": int(args.library_long_edge),
        "inspiration_manifests": (
            [str(mp.resolve()) for mp, _ in inspiration_posts] if inspiration_posts else []
        ),
        "inspiration_slide_images": [str(a.path) for a in inspiration_assets],
        "inspiration_slide_image_count": len(inspiration_assets),
        "inspiration_per_slide_matching": slide_match_debug,
        "reference_stack_order": "compose_match_crop_overlay",
        "phone_capture_grade": not args.no_phone_grade,
        "first_slide_person_rule": first_slide_person,
        "openai_plan": {
            "theme_title": plan.theme_title,
            "theme_description": plan.theme_description,
            "num_slides": n,
            "slides": [
                {"caption": s.caption, "shot_direction": s.shot_direction}
                for s in plan.slides
            ],
        },
        "reference_image_count": len(ref_paths),
        "reference_images": [str(p) for p in ref_paths],
        "caption_style": "stroke",
        "stroke_drop_shadow": stroke_drop_shadow,
        "finished_slides": finished_rows,
        "supported_input_extensions": sorted(IMAGE_EXTENSIONS),
    }
    elapsed_s = time.perf_counter() - run_started
    manifest["execution_seconds"] = round(elapsed_s, 3)
    man_path = output_dir / "slide_pipeline_manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nManifest: {man_path}")
    if elapsed_s >= 60:
        print(f"Total execution time: {elapsed_s:.1f}s ({elapsed_s / 60:.2f} min)")
    else:
        print(f"Total execution time: {elapsed_s:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
