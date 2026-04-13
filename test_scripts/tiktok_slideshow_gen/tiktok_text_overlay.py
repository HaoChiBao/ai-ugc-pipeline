"""
Draw TikTok-style on-screen text: bold sans, white fill, heavy dark stroke, optional shadow.

Position is controlled with anchors plus fractional shifts so you can move the block
around without pixel math.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont


Anchor = Literal["top", "center", "bottom"]
HAnchor = Literal["left", "center", "right"]


def _default_font_candidates() -> list[Path]:
    extra = os.environ.get("TIKTOK_FONT_PATH", "").strip()
    out: list[Path] = []
    if extra:
        out.append(Path(extra))
    windir = os.environ.get("WINDIR", r"C:\Windows")
    out.extend(
        [
            Path(windir) / "Fonts" / "arialbd.ttf",
            Path(windir) / "Fonts" / "segoeuib.ttf",
            Path(windir) / "Fonts" / "calibrib.ttf",
        ]
    )
    out.extend(
        [
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ]
    )
    return out


def resolve_tiktok_font(size_px: int) -> ImageFont.FreeTypeFont:
    """Load a bold sans font, or fall back to PIL default (small bitmap)."""
    for p in _default_font_candidates():
        if p.is_file():
            try:
                return ImageFont.truetype(str(p), size=size_px)
            except OSError:
                continue
    return ImageFont.load_default()


def _wrap_lines(
    text: str,
    font: ImageFont.FreeTypeFont,
    draw: ImageDraw.ImageDraw,
    max_width: int,
    stroke_width: int = 0,
) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for w in words:
        trial = " ".join(current + [w])
        bbox = draw.textbbox((0, 0), trial, font=font, stroke_width=stroke_width)
        tw = bbox[2] - bbox[0]
        if tw <= max_width or not current:
            current.append(w)
        else:
            lines.append(" ".join(current))
            current = [w]
    if current:
        lines.append(" ".join(current))
    return lines


@dataclass
class TikTokTextStyle:
    """Visual and layout parameters for TikTok-like caption blocks."""

    # Typography
    font_path: str | None = None
    font_size_ratio: float = 0.048
    """Font size as a fraction of ``min(image width, image height)``."""
    font_size_px: int | None = None
    """If set, overrides ``font_size_ratio``."""
    fill_color: tuple[int, int, int] = (255, 255, 255)
    stroke_color: tuple[int, int, int] = (0, 0, 0)
    stroke_width_ratio: float = 0.18
    """Stroke thickness as a fraction of font size (clamped)."""
    max_width_ratio: float = 0.88
    line_spacing_ratio: float = 0.14
    """Extra gap between lines as a fraction of font size."""

    # Block position (anchors + margins from image edges, then optional shifts)
    vertical_anchor: Anchor = "bottom"
    horizontal_anchor: HAnchor = "center"
    margin_x_ratio: float = 0.06
    margin_y_ratio: float = 0.11
    """Inset from the relevant edge(s) before applying shifts."""
    shift_x_ratio: float = 0.0
    """Move the text block horizontally: -1..1 times half the image width (approx)."""
    shift_y_ratio: float = 0.0
    """Move the text block vertically: -1..1 times half the image height (approx)."""

    vertical_safe_margin_ratio: float = 0.10
    """Minimum gap from image top/bottom to the caption block (fraction of image height)."""

    # Extra TikTok polish
    shadow: bool = True
    shadow_offset_ratio: float = 0.01
    shadow_color: tuple[int, int, int] = (0, 0, 0)

    # Internal: resolved font (set by draw function if font_path loads)
    _resolved_font: ImageFont.ImageFont | None = field(default=None, repr=False)


def _load_font(style: TikTokTextStyle, size_px: int) -> ImageFont.ImageFont:
    if style.font_path and Path(style.font_path).is_file():
        try:
            return ImageFont.truetype(style.font_path, size=size_px)
        except OSError:
            pass
    return resolve_tiktok_font(size_px)


def draw_tiktok_text(
    image: PILImage.Image,
    text: str,
    style: TikTokTextStyle | None = None,
) -> PILImage.Image:
    """
    Return a new RGB image with caption drawn on top (does not mutate the input).

    Text is word-wrapped to ``max_width_ratio`` of image width. Stroke + optional shadow
    mimic common TikTok caption styling.
    """
    style = style or TikTokTextStyle()
    base = image.convert("RGBA")
    w, h = base.size
    overlay = PILImage.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    m = min(w, h)
    if style.font_size_px is not None:
        size_px = max(12, style.font_size_px)
    else:
        size_px = max(12, int(m * style.font_size_ratio))

    font = _load_font(style, size_px)
    stroke_w = max(1, int(size_px * style.stroke_width_ratio))

    max_w = int(w * style.max_width_ratio)
    lines = _wrap_lines(text.strip(), font, draw, max_w, stroke_width=stroke_w)
    if not lines:
        return base.convert("RGB")

    line_gap = int(size_px * style.line_spacing_ratio)
    line_heights: list[int] = []
    line_widths: list[int] = []
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font, stroke_width=stroke_w)
        line_heights.append(bb[3] - bb[1])
        line_widths.append(bb[2] - bb[0])

    block_w = max(line_widths)
    block_h = sum(line_heights) + line_gap * (len(lines) - 1)

    # Anchor reference point (center of text block before shift)
    cx = w / 2
    cy = h / 2
    if style.vertical_anchor == "top":
        cy = style.margin_y_ratio * h + block_h / 2
    elif style.vertical_anchor == "bottom":
        cy = h - style.margin_y_ratio * h - block_h / 2
    else:
        cy = h / 2

    if style.horizontal_anchor == "left":
        cx = style.margin_x_ratio * w + block_w / 2
    elif style.horizontal_anchor == "right":
        cx = w - style.margin_x_ratio * w - block_w / 2
    else:
        cx = w / 2

    cx += style.shift_x_ratio * w * 0.5
    cy += style.shift_y_ratio * h * 0.5

    left = cx - block_w / 2
    top = cy - block_h / 2

    # Keep the block inside a vertical band — never flush to the absolute top/bottom edge
    m = max(0.0, min(0.22, style.vertical_safe_margin_ratio))
    min_top = m * h
    max_top = h - block_h - m * h
    if max_top >= min_top:
        top = max(min_top, min(top, max_top))
    else:
        top = max(0, (h - block_h) // 2)

    y = top
    shadow_off = int(min(w, h) * style.shadow_offset_ratio)

    for i, line in enumerate(lines):
        lw = line_widths[i]
        x = left + (block_w - lw) / 2

        if style.shadow:
            draw.text(
                (x + shadow_off, y + shadow_off),
                line,
                font=font,
                fill=(*style.shadow_color, 255),
                stroke_width=0,
            )
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(*style.fill_color, 255),
            stroke_width=stroke_w,
            stroke_fill=(*style.stroke_color, 255),
        )
        y += line_heights[i] + line_gap

    combined = PILImage.alpha_composite(base, overlay)
    return combined.convert("RGB")
