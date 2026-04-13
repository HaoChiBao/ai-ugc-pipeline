"""Build per-slide prompts for a cohesive TikTok-style carousel."""

from __future__ import annotations


def build_slide_prompt(
    user_prompt: str,
    slide_index: int,
    total_slides: int,
) -> str:
    """
    Combine the user's theme with instructions for one frame of a vertical slideshow.

    ``slide_index`` is 1-based. References are passed separately as image parts; this
    string only carries text instructions.
    """
    theme = user_prompt.strip()
    return (
        f"{theme}\n\n"
        f"You are generating frame {slide_index} of {total_slides} for a vertical "
        "TikTok-style photo slideshow carousel (same post, same account, same vibe). text generated should be simple concise with no periods at the end of the text and no em dashes\n"
        "- Keep visual consistency with the reference image(s): similar color palette, "
        "lighting mood, grain/texture, and overall aesthetic.\n"
        "- This frame should advance the narrative or theme of the sequence; avoid "
        "unrelated one-off shots.\n"
        "- Output a single full-frame image. No captions, watermarks, logos, or overlay text.\n"
        "- Prefer a vertical 9:16 composition suitable for mobile full-screen."
    )
