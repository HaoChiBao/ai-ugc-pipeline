#!/usr/bin/env python3
"""
Burn TikTok-style text onto a single image (for testing overlay parameters).

Example:

  python run_text_overlay.py photo.jpg "your caption here" -o out.png --shift-y -0.08
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.tiktok_label_overlay import draw_tiktok_label_text
from tiktok_slideshow_gen.tiktok_text_overlay import TikTokTextStyle, draw_tiktok_text


def main() -> int:
    parser = argparse.ArgumentParser(description="Add TikTok-style text to one image.")
    parser.add_argument("image", type=Path, help="Input image path")
    parser.add_argument("text", help="Caption text")
    parser.add_argument("-o", "--output", type=Path, required=True, help="Output image path")
    parser.add_argument(
        "--v-anchor",
        choices=("top", "center", "bottom"),
        default="bottom",
    )
    parser.add_argument(
        "--h-anchor",
        choices=("left", "center", "right"),
        default="center",
    )
    parser.add_argument("--shift-x", type=float, default=0.0)
    parser.add_argument("--shift-y", type=float, default=0.0)
    parser.add_argument("--margin-x", type=float, default=0.06)
    parser.add_argument("--margin-y", type=float, default=0.11)
    parser.add_argument("--font-size-ratio", type=float, default=0.048)
    parser.add_argument("--font-path", default=None, help="Optional .ttf path (or set TIKTOK_FONT_PATH)")
    parser.add_argument("--no-shadow", action="store_true")
    parser.add_argument(
        "--caption-style",
        choices=("stroke", "label"),
        default="stroke",
        help="stroke: outline style. label: black text on white fused pills.",
    )
    parser.add_argument(
        "--no-label-lowercase",
        action="store_true",
        help="label style only: preserve original casing",
    )

    args = parser.parse_args()

    from PIL import Image as PILImage

    style = TikTokTextStyle(
        font_path=args.font_path,
        vertical_anchor=args.v_anchor,
        horizontal_anchor="center" if args.caption_style == "label" else args.h_anchor,
        margin_x_ratio=args.margin_x,
        margin_y_ratio=args.margin_y,
        shift_x_ratio=0.0 if args.caption_style == "label" else args.shift_x,
        shift_y_ratio=args.shift_y,
        font_size_ratio=args.font_size_ratio,
        shadow=not args.no_shadow,
    )

    img = PILImage.open(args.image).convert("RGB")
    if args.caption_style == "label":
        out = draw_tiktok_label_text(
            img,
            args.text,
            style=style,
            lowercase=not args.no_label_lowercase,
        )
    else:
        out = draw_tiktok_text(img, args.text, style=style)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.output, format="PNG")
    print(f"Wrote {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
