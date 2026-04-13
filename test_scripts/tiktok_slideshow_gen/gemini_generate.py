"""Gemini image generation with reference images (aligned with slide-gen-service)."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

from google.genai import types
from PIL import Image as PILImage

from .prompts import build_slide_prompt
from .save_outputs import pil_from_response_image, save_slide_png

PromptBuilder = Callable[[str, int, int], str]


def _iter_response_parts(response) -> list:
    parts = getattr(response, "parts", None)
    if parts:
        return list(parts)
    out: list = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        if content and getattr(content, "parts", None):
            out.extend(content.parts)
    return out


def _first_image_from_response(response) -> PILImage.Image | None:
    for part in _iter_response_parts(response):
        fn = getattr(part, "as_image", None)
        if not callable(fn):
            continue
        raw = fn()
        if raw is not None:
            return pil_from_response_image(raw)
    return None


def _response_debug_text(response) -> str:
    lines: list[str] = []
    for part in _iter_response_parts(response):
        t = getattr(part, "text", None)
        if t:
            lines.append(t[:2000])
    return "\n".join(lines) if lines else "(no text parts)"


def get_api_key() -> str:
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "Set GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment or "
            "in a .env file next to this script."
        )
    return key


def get_model_name() -> str:
    return os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image").strip()


def generate_slideshow_images(
    *,
    user_prompt: str,
    reference_pil: list[PILImage.Image],
    output_dir: Path,
    num_slides: int,
    model: str | None = None,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    prompt_builder: PromptBuilder | None = None,
    output_stem: str = "slide",
) -> list[Path]:
    """
    Generate ``num_slides`` images under ``output_dir``.

    Reuses the same reference stack for every generation. Default filenames ``slide_01.png`` …;
    set ``output_stem`` (e.g. ``gen``) and ``prompt_builder`` for alternate modes.
    """
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError(
            "Install dependencies: pip install -r test_scripts/requirements.txt"
        ) from e

    api_key = get_api_key()
    model_name = (model or get_model_name()).strip()
    ar = (aspect_ratio or os.environ.get("GEMINI_ASPECT_RATIO", "9:16")).strip()
    size = (image_size or os.environ.get("GEMINI_IMAGE_SIZE", "2K")).strip()

    if size not in ("512", "1K", "2K", "4K"):
        raise ValueError(f"Invalid image_size {size!r}; expected 512, 1K, 2K, or 4K")

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio=ar,
            image_size=size,
        ),
    )

    build = prompt_builder or build_slide_prompt
    saved: list[Path] = []
    for k in range(1, num_slides + 1):
        slide_instruction = build(user_prompt, k, num_slides)
        contents: list = [slide_instruction]
        contents.extend(reference_pil)

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

        out_path = output_dir / f"{output_stem}_{k:02d}.png"
        out_img = _first_image_from_response(response)
        if out_img is None:
            dbg = _response_debug_text(response)
            raise RuntimeError(
                f"No image in model response for frame {k}. Debug: {dbg[:800]}"
            )
        save_slide_png(out_img, out_path)
        saved.append(out_path)

    return saved


def generate_images_from_prompt_list(
    *,
    prompts: list[str],
    reference_pil: list[PILImage.Image] | None = None,
    reference_pil_per_frame: list[list[PILImage.Image]] | None = None,
    output_dir: Path,
    model: str | None = None,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    output_stem: str = "slide",
) -> list[Path]:
    """
    One Gemini call per string in ``prompts``.

    Provide either ``reference_pil`` (same stack for every frame) **or**
    ``reference_pil_per_frame`` (one list per prompt; must match ``len(prompts)``).
    """
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError(
            "Install dependencies: pip install -r test_scripts/requirements.txt"
        ) from e

    if not prompts:
        return []

    if reference_pil_per_frame is not None:
        if len(reference_pil_per_frame) != len(prompts):
            raise ValueError(
                "reference_pil_per_frame length must match prompts "
                f"({len(reference_pil_per_frame)} != {len(prompts)})",
            )
        per_frame: list[list[PILImage.Image]] = reference_pil_per_frame
    else:
        if reference_pil is None:
            raise ValueError("Provide reference_pil or reference_pil_per_frame")
        per_frame = [reference_pil] * len(prompts)

    api_key = get_api_key()
    model_name = (model or get_model_name()).strip()
    ar = (aspect_ratio or os.environ.get("GEMINI_ASPECT_RATIO", "9:16")).strip()
    size = (image_size or os.environ.get("GEMINI_IMAGE_SIZE", "2K")).strip()

    if size not in ("512", "1K", "2K", "4K"):
        raise ValueError(f"Invalid image_size {size!r}; expected 512, 1K, 2K, or 4K")

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio=ar,
            image_size=size,
        ),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for k, slide_instruction in enumerate(prompts, start=1):
        contents: list = [slide_instruction]
        contents.extend(per_frame[k - 1])

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

        out_path = output_dir / f"{output_stem}_{k:02d}.png"
        out_img = _first_image_from_response(response)
        if out_img is None:
            dbg = _response_debug_text(response)
            raise RuntimeError(
                f"No image in model response for frame {k}. Debug: {dbg[:800]}"
            )
        save_slide_png(out_img, out_path)
        saved.append(out_path)

    return saved


def generate_remastered_slides_from_bases(
    *,
    prompts: list[str],
    base_images: list[PILImage.Image],
    identity_reference_pil: list[PILImage.Image],
    output_dir: Path,
    model: str | None = None,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    output_stem: str = "frame",
) -> list[Path]:
    """
    One Gemini call per slide: **remaster** the slide's **base** still, with optional identity refs.

    Multimodal order per request: ``[prompt_text, base_image, *identity_reference_pil]``.
    """
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError(
            "Install dependencies: pip install -r test_scripts/requirements.txt"
        ) from e

    if not prompts:
        return []
    if len(base_images) != len(prompts):
        raise ValueError(
            "base_images length must match prompts "
            f"({len(base_images)} != {len(prompts)})",
        )

    api_key = get_api_key()
    model_name = (model or get_model_name()).strip()
    ar = (aspect_ratio or os.environ.get("GEMINI_ASPECT_RATIO", "9:16")).strip()
    size = (image_size or os.environ.get("GEMINI_IMAGE_SIZE", "2K")).strip()

    if size not in ("512", "1K", "2K", "4K"):
        raise ValueError(f"Invalid image_size {size!r}; expected 512, 1K, 2K, or 4K")

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio=ar,
            image_size=size,
        ),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for k, slide_instruction in enumerate(prompts, start=1):
        base = base_images[k - 1]
        contents: list = [slide_instruction, base]
        contents.extend(identity_reference_pil)

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

        out_path = output_dir / f"{output_stem}_{k:02d}.png"
        out_img = _first_image_from_response(response)
        if out_img is None:
            dbg = _response_debug_text(response)
            raise RuntimeError(
                f"No image in model response for frame {k}. Debug: {dbg[:800]}"
            )
        save_slide_png(out_img, out_path)
        saved.append(out_path)

    return saved
