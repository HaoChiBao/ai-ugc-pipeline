"""Per-slide TikTok caption placement: always horizontally centered; vertical variance only."""

from __future__ import annotations

import random
from typing import Any

from .tiktok_text_overlay import TikTokTextStyle


def style_to_dict(style: TikTokTextStyle) -> dict[str, Any]:
    return {
        "vertical_anchor": style.vertical_anchor,
        "horizontal_anchor": style.horizontal_anchor,
        "margin_x_ratio": style.margin_x_ratio,
        "margin_y_ratio": style.margin_y_ratio,
        "shift_x_ratio": style.shift_x_ratio,
        "shift_y_ratio": style.shift_y_ratio,
        "font_size_ratio": style.font_size_ratio,
        "max_width_ratio": style.max_width_ratio,
        "vertical_safe_margin_ratio": style.vertical_safe_margin_ratio,
        "shadow": style.shadow,
    }


def resolve_placement_rng(
    *,
    seed: int | None,
    placement_seed: int | None,
) -> random.Random:
    """
    RNG for text placement independent of image-selection RNG.

    If ``placement_seed`` is set, it wins. Else if ``seed`` is set, derive a
    distinct stream. Else use a nondeterministic seed.
    """
    if placement_seed is not None:
        return random.Random(placement_seed)
    if seed is not None:
        # Splitmix64-style mix so placement differs from image sampling
        mixed = seed ^ 0x9E3779B97F4A7C15
        mixed ^= mixed >> 30
        mixed *= 0xBF58476D1CE4E5B9
        mixed ^= mixed >> 27
        return random.Random(mixed & 0xFFFFFFFFFFFFFFFF)
    return random.Random()


# Vertical band used when randomizing anchor + shift (before draw-time safe clamp).
# Keeps the *intended* position away from edges; draw_tiktok_text also enforces vertical_safe_margin_ratio.
_MIN_ANCHOR_MARGIN_Y = 0.10
_MAX_ANCHOR_MARGIN_Y = 0.16


def random_tiktok_style(
    rng: random.Random,
    *,
    shadow: bool = True,
    font_size_ratio_center: float = 0.048,
) -> TikTokTextStyle:
    """
    One random style: **horizontal center always**; vertical anchor + nudge + margins vary.
    **Font size and max line width are fixed** across slides (from ``font_size_ratio_center``).
    """
    v = rng.choices(
        ["top", "center", "bottom"],
        weights=[0.20, 0.25, 0.55],
        k=1,
    )[0]
    h = "center"
    shift_x = 0.0
    # Nudge within a moderate range; final position is still clamped in draw_tiktok_text
    shift_y = rng.uniform(-0.16, 0.16)
    mx = rng.uniform(0.05, 0.09)
    my = rng.uniform(_MIN_ANCHOR_MARGIN_Y, _MAX_ANCHOR_MARGIN_Y)

    return TikTokTextStyle(
        vertical_anchor=v,
        horizontal_anchor=h,
        margin_x_ratio=mx,
        margin_y_ratio=my,
        shift_x_ratio=shift_x,
        shift_y_ratio=shift_y,
        font_size_ratio=font_size_ratio_center,
        fill_color=(255, 255, 255),
        stroke_color=(0, 0, 0),
        max_width_ratio=0.88,
        vertical_safe_margin_ratio=0.10,
        shadow=shadow,
    )


def styles_for_slides(
    count: int,
    rng: random.Random,
    *,
    shadow: bool = True,
    font_size_ratio_center: float = 0.048,
) -> list[TikTokTextStyle]:
    return [
        random_tiktok_style(
            rng,
            shadow=shadow,
            font_size_ratio_center=font_size_ratio_center,
        )
        for _ in range(count)
    ]
