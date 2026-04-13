"""Write generated images to disk."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image as PILImage


def pil_from_response_image(raw) -> PILImage.Image:
    """Convert a Gemini ``as_image()`` result to RGB PIL."""
    if isinstance(raw, PILImage.Image):
        return raw.convert("RGB")
    data = getattr(raw, "image_bytes", None)
    if data:
        return PILImage.open(io.BytesIO(data)).convert("RGB")
    raise TypeError(f"Cannot convert image part: {type(raw)!r}")


def save_slide_png(image: PILImage.Image, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path, format="PNG")
