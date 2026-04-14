"""
Shared CLI: OpenAI/Gemini caption plan + random images from disk + TikTok text overlay.

Does **not** call Gemini (or any API) for **image generation** — only for caption JSON
when using an LLM provider.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.caption_plan_llm import (
    CaptionPlan,
    generate_caption_plan_gemini,
    generate_caption_plan_openai,
)
from tiktok_slideshow_gen.load_images import IMAGE_EXTENSIONS
from tiktok_slideshow_gen.random_image_pool import pick_random_image_paths
from tiktok_slideshow_gen.text_placement_variety import (
    resolve_placement_rng,
    style_to_dict,
    styles_for_slides,
)
from tiktok_slideshow_gen.tiktok_label_overlay import draw_tiktok_label_text
from tiktok_slideshow_gen.tiktok_text_overlay import TikTokTextStyle, draw_tiktok_text


def _load_env() -> None:
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv(_SCRIPT_DIR.parent / "client" / ".env")


def _plan(provider: str, prompt: str, model: str | None) -> CaptionPlan:
    if provider == "openai":
        return generate_caption_plan_openai(prompt, model=model)
    if provider == "gemini":
        return generate_caption_plan_gemini(prompt, model=model)
    raise ValueError(f"Unknown provider: {provider}")


def build_parser(prog: str | None = None) -> argparse.ArgumentParser:
    default_in = _SCRIPT_DIR / "input_text_images"
    default_out = _SCRIPT_DIR / "output_captioned_images"

    parser = argparse.ArgumentParser(
        prog=prog,
        description=(
            "TikTok motivation-core slideshow: LLM writes theme + captions (master tone in prompt), "
            "random images from disk, captions centered horizontally with vertical "
            "placement variance (unless --fixed-layout). No AI image generation."
        ),
    )
    parser.add_argument(
        "prompt",
        help="Topic or angle for the slideshow (motivation-core tone is applied by the system prompt).",
    )
    parser.add_argument(
        "--provider",
        choices=("openai", "gemini"),
        default="openai",
        help="LLM for captions/theme (default: openai; set OPENAI_API_KEY)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Override OPENAI_MODEL or GEMINI_TEXT_MODEL for this run",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=default_in,
        help=f"Pool of images to sample (default: {default_in})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_out,
        help=f"Output folder for captioned PNGs + manifest (default: {default_out})",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for image selection (optional)",
    )
    parser.add_argument(
        "--fixed-layout",
        action="store_true",
        help="One vertical position for every slide (--v-anchor, --shift-y, margins). "
        "Horizontal is always centered. Default: vertical variance per slide.",
    )
    parser.add_argument(
        "--placement-seed",
        type=int,
        default=None,
        help="Reproducible text placement when varying (optional). Defaults to a mix of --seed if set.",
    )
    parser.add_argument(
        "--v-anchor",
        choices=("top", "center", "bottom"),
        default="bottom",
        help="With --fixed-layout: vertical anchor. When varying placement, ignored.",
    )
    parser.add_argument(
        "--h-anchor",
        choices=("left", "center", "right"),
        default="center",
        help="Ignored (captions are always horizontally centered).",
    )
    parser.add_argument(
        "--shift-x",
        type=float,
        default=0.0,
        help="Ignored (horizontal shift disabled; captions stay centered).",
    )
    parser.add_argument(
        "--shift-y",
        type=float,
        default=0.0,
        help="With --fixed-layout: vertical nudge. When varying, ignored.",
    )
    parser.add_argument(
        "--margin-x",
        type=float,
        default=0.06,
        help="With --fixed-layout: side margin. When varying, ignored.",
    )
    parser.add_argument(
        "--margin-y",
        type=float,
        default=0.11,
        help="With --fixed-layout: edge margin. When varying, ignored.",
    )
    parser.add_argument(
        "--font-size-ratio",
        type=float,
        default=0.048,
        help="With --fixed-layout: exact size = ratio * min(w,h). When varying: center of random range.",
    )
    parser.add_argument(
        "--no-shadow",
        action="store_true",
        help="Disable drop shadow (stroke style only)",
    )
    parser.add_argument(
        "--caption-style",
        choices=("stroke", "label"),
        default="stroke",
        help="stroke: white fill + black outline (default). label: black text on fused white rounded pills.",
    )
    parser.add_argument(
        "--no-label-lowercase",
        action="store_true",
        help="With --caption-style label: keep original letter casing (default: lowercase for label style).",
    )
    parser.add_argument(
        "--no-text-overlay",
        action="store_true",
        help="Skip burning captions into pixels; still writes slide PNGs (raw photos) and caption_manifest.json.",
    )
    return parser


def main(argv: list[str] | None = None, *, prog: str | None = None) -> int:
    _load_env()
    parser = build_parser(prog=prog)
    args = parser.parse_args(argv)

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"LLM provider: {args.provider}")
    print(f"Caption style: {args.caption_style}")
    plan = _plan(args.provider, args.prompt, args.model)
    n = plan.num_slides
    captions = plan.captions_in_order()
    print(f"Theme: {plan.theme_title!r} ({n} slide(s))")
    print("Planned shots (for reference; this runner uses random photos, not image gen):")
    for i, s in enumerate(plan.slides, start=1):
        print(f"  {i}. {s.shot_direction}")
    if plan.theme_description:
        print(f"Description: {plan.theme_description}")

    picked = pick_random_image_paths(input_dir, n, seed=args.seed)
    print("Selected images (random, no generation):")
    for p in picked:
        print(f"  - {p}")

    shadow = not args.no_shadow
    label_lowercase = not args.no_label_lowercase

    if args.fixed_layout:
        styles = [
            TikTokTextStyle(
                vertical_anchor=args.v_anchor,
                horizontal_anchor="center",
                margin_x_ratio=args.margin_x,
                margin_y_ratio=args.margin_y,
                shift_x_ratio=0.0,
                shift_y_ratio=args.shift_y,
                font_size_ratio=args.font_size_ratio,
                shadow=shadow,
            )
        ] * n
        layout_meta = {
            "mode": "fixed",
            "horizontal": "center",
            "caption_style": args.caption_style,
            "text_style": style_to_dict(styles[0]),
        }
    else:
        placement_rng = resolve_placement_rng(
            seed=args.seed,
            placement_seed=args.placement_seed,
        )
        styles = styles_for_slides(
            n,
            placement_rng,
            shadow=shadow,
            font_size_ratio_center=args.font_size_ratio,
        )
        layout_meta = {
            "mode": "varied_per_slide",
            "horizontal": "center",
            "vertical": "varied_per_slide",
            "placement_seed": args.placement_seed,
            "run_seed_used_for_placement": args.seed is not None
            and args.placement_seed is None,
            "font_size_ratio_center": args.font_size_ratio,
            "caption_style": args.caption_style,
        }
        print(
            "Text placement: vertical variance per slide, horizontal center"
            + (
                f" (placement_seed={args.placement_seed})"
                if args.placement_seed is not None
                else (f" (derived from --seed {args.seed})" if args.seed is not None else "")
            ),
        )

    from PIL import Image as PILImage

    outputs: list[dict[str, object]] = []
    for i, (src_path, caption) in enumerate(zip(picked, captions), start=1):
        img = PILImage.open(src_path).convert("RGB")
        style = styles[i - 1]
        if args.no_text_overlay:
            out_img = img
        elif args.caption_style == "label":
            out_img = draw_tiktok_label_text(
                img,
                caption,
                style=style,
                lowercase=label_lowercase,
            )
        else:
            out_img = draw_tiktok_text(img, caption, style=style)
        out_name = f"slide_{i:02d}.png"
        out_path = output_dir / out_name
        out_img.save(out_path, format="PNG")
        print(f"Wrote {out_path}")
        slide_row: dict[str, object] = {
            "index": i,
            "source_image": str(src_path),
            "caption": caption,
            "shot_direction": plan.slides[i - 1].shot_direction,
            "output": str(out_path),
        }
        if not args.fixed_layout:
            slide_row["text_style"] = style_to_dict(style)
        outputs.append(slide_row)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "prompt": args.prompt,
        "provider": args.provider,
        "caption_style": args.caption_style,
        "text_overlay": not args.no_text_overlay,
        "label_lowercase": label_lowercase if args.caption_style == "label" else None,
        "theme_title": plan.theme_title,
        "theme_description": plan.theme_description,
        "num_slides": n,
        "text_layout": layout_meta,
        "text_style": {
            "vertical_anchor": args.v_anchor,
            "horizontal_anchor": args.h_anchor,
            "shift_x_ratio": args.shift_x,
            "shift_y_ratio": args.shift_y,
            "margin_x_ratio": args.margin_x,
            "margin_y_ratio": args.margin_y,
            "font_size_ratio": args.font_size_ratio,
            "shadow": not args.no_shadow,
            "note": "Used when --fixed-layout; otherwise see text_layout and per-slide text_style",
        },
        "slides": outputs,
        "supported_input_extensions": sorted(IMAGE_EXTENSIONS),
        "image_generation": "none — source images only, captions from LLM",
    }
    manifest_path = output_dir / "caption_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nManifest: {manifest_path}")
    return 0
