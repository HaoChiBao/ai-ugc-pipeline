"""Load reference images from disk for Gemini multimodal context."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image as PILImage

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


def list_image_paths(input_dir: Path) -> list[Path]:
    """Return sorted paths to image files under ``input_dir`` (non-recursive)."""
    if not input_dir.is_dir():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")
    paths: list[Path] = []
    for p in sorted(input_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            paths.append(p)
    return paths


def load_reference_images(
    input_dir: Path,
    *,
    max_images: int = 8,
) -> tuple[list[Path], list[PILImage.Image]]:
    """
    Load up to ``max_images`` reference images as RGB PIL images.

    Returns (source_paths, pil_images) for debugging/logging and model input.
    """
    paths = list_image_paths(input_dir)[:max_images]
    if not paths:
        raise ValueError(
            f"No image files found in {input_dir}. "
            f"Supported extensions: {', '.join(sorted(IMAGE_EXTENSIONS))}."
        )
    pil_images: list[PILImage.Image] = []
    for p in paths:
        try:
            pil_images.append(PILImage.open(p).convert("RGB"))
        except OSError as e:
            raise OSError(f"Could not open image: {p}") from e
    return paths, pil_images


def load_n_reference_images(
    input_dir: Path,
    count: int,
    *,
    mode: str = "first",
    seed: int | None = None,
) -> tuple[list[Path], list[PILImage.Image]]:
    """
    Exactly ``count`` images for style references (Gemini multimodal).

    ``mode`` ``first``: first ``count`` paths from :func:`list_image_paths` (sorted).
    ``mode`` ``random``: ``count`` random distinct paths (reproducible with ``seed``).
    """
    if count < 1:
        raise ValueError("count must be >= 1")
    if mode not in ("first", "random"):
        raise ValueError("mode must be 'first' or 'random'")
    all_paths = list_image_paths(input_dir)
    if mode == "first":
        paths = all_paths[:count]
    else:
        if len(all_paths) < count:
            raise ValueError(
                f"Need at least {count} images in {input_dir}; found {len(all_paths)}."
            )
        rng = random.Random(seed) if seed is not None else random.Random()
        paths = rng.sample(all_paths, count)
    if len(paths) < count:
        raise ValueError(
            f"Need at least {count} images in {input_dir}; found {len(paths)}."
        )
    pil_images: list[PILImage.Image] = []
    for p in paths:
        try:
            pil_images.append(PILImage.open(p).convert("RGB"))
        except OSError as e:
            raise OSError(f"Could not open image: {p}") from e
    return paths, pil_images


def load_three_reference_images(
    input_dir: Path,
    *,
    mode: str = "first",
    seed: int | None = None,
) -> tuple[list[Path], list[PILImage.Image]]:
    """Exactly **three** images; see :func:`load_n_reference_images`."""
    return load_n_reference_images(input_dir, 3, mode=mode, seed=seed)
