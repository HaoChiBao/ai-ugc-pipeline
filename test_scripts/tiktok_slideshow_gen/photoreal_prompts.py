"""Prompts for phone-like, reference-style-matched image batches (not compositing refs)."""

from __future__ import annotations


def get_phone_camera_master_block() -> str:
    """Shared phone-camera + reference-usage rules (for photoreal batch and themed slide pipeline)."""
    return _master_phone_camera_block()


def _master_phone_camera_block() -> str:
    return (
        "## Master look: real smartphone camera (not a render, not a stock shoot)\n"
        "- **Device feel:** As if shot on a modern phone (main rear camera or selfie): natural phone JPEG look, "
        "authentic dynamic range (not HDR-merged \"glow\"), slight sharpening from phone processing but not "
        "over-crisp. Occasional mild motion blur or missed focus in one area is OK if it feels candid.\n"
        "- **Noise and texture:** Light to moderate ISO grain in shadows; real sensor noise, not smooth plastic. "
        "Skin has pores and uneven tone where light hits; no airbrushed wax skin.\n"
        "- **Lens and light:** Wide-ish phone field of view, subtle lens flare only when the sun is in frame, "
        "believable handheld framing (slight tilt is fine). No studio softboxes unless the scene is clearly lit that way.\n"
        "- **Avoid \"AI photo\" tells:** oversaturated HDR halos, perfectly even lighting, symmetry worship, "
        "over-sharpened edges, fake bokeh donuts, waxy faces, extra fingers, text in the image, or "
        "hyper-detailed fantasy clarity.\n"
        "- **Framing:** Prefer vertical **9:16** like a phone screen; casual composition, not centered poster layout.\n\n"
        "## How to use the reference images (critical)\n"
        "- The attached reference images are **style and mood guides only** (color, grain, lighting vibe, era of phone look).\n"
        "- **Do NOT** collage, stitch, blend, layer, or merge multiple reference photos into one composite. "
        "**Do NOT** output a grid or split screen of references.\n"
        "- **Do NOT** copy a reference pixel-for-pixel. Each output must be a **new** photograph that could sit "
        "next to the refs in the same camera roll.\n\n"
        "## Same style, different shots (series)\n"
        "- All images in this batch should share **one visual language** with the references (grade, grain, phone feel) "
        "but each image is its **own** moment.\n"
        "- **Variation examples:** If the theme is a person running, vary **runner identity** (different person or "
        "clearly different outfit/hair), **angle** (side, three-quarter, farther vs closer), **moment** (stride, "
        "breathing break, tying shoe), **background slice** - still the same vibe, not the same frame repeated.\n"
        "- If the theme is a place or object, vary **time of day**, **distance**, or **detail** without changing "
        "the overall story the user asked for.\n"
        "- **Output:** exactly **one** full-frame photograph per request. No on-image text, logos, or watermarks.\n"
    )


def build_photoreal_prompt(user_prompt: str, image_index: int, total_images: int) -> str:
    """
    Per-output text for Gemini. Reference images are passed as separate parts.

    User prompt = subject/theme. Master block = phone camera + style-only refs + variation rules.
    """
    theme = user_prompt.strip()
    variation = (
        f"## This frame only ({image_index} of {total_images})\n"
        "Generate one new phone photo for the user's theme above. "
        "Make it clearly **different** from the other frames in this batch (new moment, angle, or subject variation) "
        "while staying in the same style family as the reference images."
    )
    return f"{theme}\n\n{_master_phone_camera_block()}{variation}"
