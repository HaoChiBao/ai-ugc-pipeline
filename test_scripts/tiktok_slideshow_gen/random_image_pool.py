"""Pick random image paths from a folder (with replacement if the pool is small)."""

from __future__ import annotations

import random
from pathlib import Path

from .load_images import list_image_paths


def pick_random_image_paths(
    input_dir: Path,
    count: int,
    *,
    seed: int | None = None,
) -> list[Path]:
    """
    Choose ``count`` images from ``input_dir``. Unique when possible; otherwise repeats.

    ``seed`` makes runs reproducible (optional).
    """
    paths = list_image_paths(input_dir)
    if not paths:
        raise ValueError(f"No images in {input_dir}")
    if count <= 0:
        return []
    rng = random.Random(seed) if seed is not None else random.Random()
    if len(paths) >= count:
        return rng.sample(paths, count)
    return rng.choices(paths, k=count)
