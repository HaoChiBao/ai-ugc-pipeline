#!/usr/bin/env python3
"""
Pick 3 random images from input_images/ as style/mood references only (not composited together),
and generate multiple new images from your prompt. Each output aims for a real-phone-camera look
with consistent style across the batch and natural shot-to-shot variation.

Requires GEMINI_API_KEY and google-genai (see requirements.txt).

Outputs: output_images/gen_01.png, gen_02.png, ... (default folders under test_scripts/).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image as PILImage

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.gemini_generate import generate_slideshow_images
from tiktok_slideshow_gen.photoreal_prompts import build_photoreal_prompt
from tiktok_slideshow_gen.random_image_pool import pick_random_image_paths


def _load_env() -> None:
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv(_SCRIPT_DIR.parent / "client" / ".env")


def main() -> int:
    _load_env()

    default_in = _SCRIPT_DIR / "input_images"
    default_out = _SCRIPT_DIR / "output_images"

    parser = argparse.ArgumentParser(
        description="3 random reference images + prompt: Gemini photoreal-style batch.",
    )
    parser.add_argument(
        "prompt",
        help="What to generate (subject, scene, mood). Style should follow the 3 refs.",
    )
    parser.add_argument(
        "--num-images",
        type=int,
        default=4,
        help="How many images to generate (default: 4)",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=default_in,
        help=f"Folder to sample 3 reference images from (default: {default_in})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_out,
        help=f"Output folder (default: {default_out})",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for which 3 files are picked (optional)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Override GEMINI_IMAGE_MODEL",
    )
    parser.add_argument(
        "--aspect-ratio",
        default=None,
        help="Override GEMINI_ASPECT_RATIO (e.g. 9:16)",
    )
    parser.add_argument(
        "--image-size",
        default=None,
        help="Override GEMINI_IMAGE_SIZE: 512, 1K, 2K, or 4K",
    )

    args = parser.parse_args()
    if args.num_images < 1:
        print("error: --num-images must be >= 1", file=sys.stderr)
        return 2

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    ref_paths = pick_random_image_paths(input_dir, 3, seed=args.seed)
    print("Reference images (3 random):")
    for p in ref_paths:
        print(f"  - {p}")

    ref_pil: list[PILImage.Image] = []
    for p in ref_paths:
        try:
            ref_pil.append(PILImage.open(p).convert("RGB"))
        except OSError as e:
            print(f"error: could not open {p}: {e}", file=sys.stderr)
            return 1

    paths = generate_slideshow_images(
        user_prompt=args.prompt,
        reference_pil=ref_pil,
        output_dir=output_dir,
        num_slides=args.num_images,
        model=args.model,
        aspect_ratio=args.aspect_ratio,
        image_size=args.image_size,
        prompt_builder=build_photoreal_prompt,
        output_stem="gen",
    )

    print(f"\nWrote {len(paths)} image(s) to {output_dir}:")
    for p in paths:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
