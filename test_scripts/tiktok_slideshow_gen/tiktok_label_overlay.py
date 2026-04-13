"""
TikTok “label” caption style: black sans-serif text on opaque white rounded pills per line.

Lines stack with no vertical gap so pills fuse into a stepped / contoured block (common
in motivation-core edits). Placement uses the same anchor + safe-margin rules as
:func:`tiktok_text_overlay.draw_tiktok_text`.
"""

from __future__ import annotations

from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont

from .tiktok_text_overlay import TikTokTextStyle, _load_font, _wrap_lines


def draw_tiktok_label_text(
    image: PILImage.Image,
    text: str,
    style: TikTokTextStyle | None = None,
    *,
    lowercase: bool = True,
    padding_ratio: float = 0.58,
    text_color: tuple[int, int, int] = (0, 0, 0),
    label_bg: tuple[int, int, int] = (255, 255, 255),
) -> PILImage.Image:
    """
    Draw caption as black text on stacked white rounded rectangles (one per line).

    Each line gets a tight pill-shaped background; lines are stacked with no gap so
    widths can differ (stair-step silhouette). The whole block is positioned like
    :func:`~tiktok_slideshow_gen.tiktok_text_overlay.draw_tiktok_text`.
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
    raw = text.strip()
    if lowercase:
        raw = raw.lower()
    max_w = int(w * style.max_width_ratio)
    lines = _wrap_lines(raw, font, draw, max_w, stroke_width=0)
    if not lines:
        return base.convert("RGB")

    # Per-line ink boxes and outer pill boxes
    line_metrics: list[tuple[str, int, int, int, int]] = []
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font, stroke_width=0)
        tw = bb[2] - bb[0]
        th = bb[3] - bb[1]
        pad = max(4, int(th * padding_ratio))
        box_w = tw + 2 * pad
        box_h = th + 2 * pad
        line_metrics.append((line, tw, th, pad, box_w, box_h))

    block_w = max(m[4] for m in line_metrics)  # box_w
    block_h = sum(m[5] for m in line_metrics)  # box_h per line, fused stack

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

    top = cy - block_h / 2

    vm = max(0.0, min(0.22, style.vertical_safe_margin_ratio))
    min_top = vm * h
    max_top = h - block_h - vm * h
    if max_top >= min_top:
        top = max(min_top, min(top, max_top))
    else:
        top = max(0, (h - block_h) // 2)

    y = float(top)
    for line, tw, th, pad, box_w, box_h in line_metrics:
        x0 = cx - box_w / 2
        x1 = cx + box_w / 2
        y0 = y
        y1 = y + box_h
        radius = min(box_w, box_h) // 2
        draw.rounded_rectangle(
            [int(x0), int(y0), int(x1), int(y1)],
            radius=radius,
            fill=(*label_bg, 255),
        )
        mid_y = (y0 + y1) / 2
        draw.text(
            (cx, mid_y),
            line,
            font=font,
            fill=(*text_color, 255),
            anchor="mm",
        )
        y += box_h

    combined = PILImage.alpha_composite(base, overlay)
    return combined.convert("RGB")
