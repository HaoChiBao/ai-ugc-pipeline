"""Light post-process: muted phone-like color + subtle sensor grain (matches pipeline prompts)."""

from __future__ import annotations

from PIL import Image, ImageEnhance


def apply_phone_capture_grade(
    image: Image.Image,
    *,
    saturation: float = 0.80,
    contrast: float = 0.97,
    grain_blend: float = 0.028,
    grain_sigma: int = 36,
) -> Image.Image:
    """
    Lower saturation, slightly flat contrast, and a whisper of luminance noise (iPhone-ish).

    Does not blur the background (that stays a model prompt constraint).
    """
    img = image.convert("RGB")
    img = ImageEnhance.Color(img).enhance(saturation)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    w, h = img.size
    try:
        noise_l = Image.effect_noise((w, h), grain_sigma)
        noise_rgb = Image.merge("RGB", (noise_l, noise_l, noise_l))
        img = Image.blend(img, noise_rgb, grain_blend)
    except (AttributeError, ValueError, MemoryError):
        pass
    return img


__all__ = ["apply_phone_capture_grade"]
