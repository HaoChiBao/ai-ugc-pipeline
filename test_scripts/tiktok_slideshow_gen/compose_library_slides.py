"""Build a slideshow from existing images only: scene labels + match to planned slides (no Gemini)."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from PIL import Image as PILImage

if TYPE_CHECKING:
    from .caption_plan_llm import CaptionPlan

from .tiktok_analysis_inspiration import InspirationSlideAsset


def _role_alignment_boost(slide_k: int, total: int, role: str) -> float:
    r = (role or "").lower()
    if total < 2:
        return 0.0
    if slide_k == 1 and any(x in r for x in ("hook", "open", "intro", "first")):
        return 0.11
    if slide_k == total and any(x in r for x in ("closer", "cta", "payoff", "last", "end", "finale")):
        return 0.11
    if 1 < slide_k < total and any(x in r for x in ("tip", "value", "list", "step", "middle", "body")):
        return 0.06
    return 0.0


@dataclass
class LibrarySlideAsset:
    """One on-disk image plus a text blob used to match ``shot_direction`` + caption."""

    path: Path
    source: Literal["input", "inspiration"]
    scene_blob: str
    role_in_sequence: str = ""
    categories: tuple[str, ...] = ()


def _image_path_to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        mime = "image/jpeg"
    b64 = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def describe_input_image_openai(
    path: Path,
    *,
    model: str | None = None,
    image_detail: str = "low",
) -> dict[str, Any]:
    """
    One vision call: short scene description + category tags for library matching.

    Returns dict with keys scene_summary, visual_elements, categories (list[str]).
    """
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("Install openai: pip install openai") from e

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (see test_scripts/.env).")

    m = (
        (model or os.environ.get("OPENAI_VISION_MODEL") or "gpt-4o-mini").strip()
    )
    client = OpenAI(api_key=api_key)

    schema_hint = (
        "Return a JSON object with keys: "
        '"scene_summary" (one short sentence), '
        '"visual_elements" (comma-separated visible things: people, objects, setting), '
        '"categories" (array of 4–12 lowercase tags: e.g. indoor, running, shoes, car, gym, food, selfie). '
        "No other keys."
    )
    content: list[dict[str, Any]] = [
        {"type": "text", "text": schema_hint},
        {
            "type": "image_url",
            "image_url": {"url": _image_path_to_data_url(path), "detail": image_detail},
        },
    ]

    resp = client.chat.completions.create(
        model=m,
        messages=[
            {
                "role": "system",
                "content": "You output only valid JSON objects.",
            },
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    raw = resp.choices[0].message.content
    if not raw:
        raise RuntimeError("OpenAI returned empty content")
    return json.loads(raw)


def input_path_to_library_asset(
    path: Path,
    *,
    vision_model: str | None,
    no_vision: bool,
    image_detail: str = "low",
) -> LibrarySlideAsset:
    if no_vision:
        stem = path.stem.replace("_", " ").replace("-", " ")
        blob = f"user library image {stem}"
        return LibrarySlideAsset(
            path=path.resolve(),
            source="input",
            scene_blob=blob,
            role_in_sequence="",
            categories=(),
        )

    try:
        data = describe_input_image_openai(path, model=vision_model, image_detail=image_detail)
    except (OSError, json.JSONDecodeError, RuntimeError, KeyError):
        stem = path.stem.replace("_", " ").replace("-", " ")
        return LibrarySlideAsset(
            path=path.resolve(),
            source="input",
            scene_blob=f"user library image {stem}",
            role_in_sequence="",
            categories=(),
        )

    summary = str(data.get("scene_summary", "") or "").strip()
    visual = str(data.get("visual_elements", "") or "").strip()
    cats = data.get("categories")
    cat_list: list[str] = []
    if isinstance(cats, list):
        for c in cats:
            if isinstance(c, str) and c.strip():
                cat_list.append(c.strip().lower())
    cat_tup = tuple(cat_list)
    blob = " ".join(x for x in (summary, visual, " ".join(cat_tup)) if x)
    if not blob:
        stem = path.stem.replace("_", " ").replace("-", " ")
        blob = f"user library image {stem}"
    return LibrarySlideAsset(
        path=path.resolve(),
        source="input",
        scene_blob=blob,
        role_in_sequence="",
        categories=cat_tup,
    )


def input_path_to_library_asset_with_notes(
    path: Path,
    *,
    precomputed_scene_text: str | None = None,
    vision_model: str | None = None,
    no_vision: bool = False,
    image_detail: str = "low",
) -> LibrarySlideAsset:
    """
    Prefer ``categorize_input_images.py`` output as ``scene_blob``; else live vision or filename fallback.
    """
    raw = (precomputed_scene_text or "").strip()
    if raw:
        blob = " ".join(raw.split())
        return LibrarySlideAsset(
            path=path.resolve(),
            source="input",
            scene_blob=blob,
            role_in_sequence="",
            categories=(),
        )
    return input_path_to_library_asset(
        path,
        vision_model=vision_model,
        no_vision=no_vision,
        image_detail=image_detail,
    )


def inspiration_asset_to_library_asset(a: InspirationSlideAsset) -> LibrarySlideAsset:
    blob = f"{a.scene_summary} {a.visual_elements} {a.role_in_sequence}".strip()
    if not blob:
        blob = a.post_folder
    return LibrarySlideAsset(
        path=a.path.resolve(),
        source="inspiration",
        scene_blob=blob,
        role_in_sequence=a.role_in_sequence,
        categories=(),
    )


def score_planned_slide_vs_library_asset(
    shot_direction: str,
    caption: str,
    slide_k: int,
    total_slides: int,
    asset: LibrarySlideAsset,
) -> float:
    query = f"{shot_direction} {caption}".lower()
    blob = asset.scene_blob.lower()
    base = SequenceMatcher(None, query, blob).ratio()
    q_tokens = set(re.findall(r"[a-z]{4,}", query))
    b_tokens = set(re.findall(r"[a-z]{4,}", blob))
    overlap = len(q_tokens & b_tokens)
    return base + 0.035 * min(overlap, 14) + _role_alignment_boost(
        slide_k,
        total_slides,
        asset.role_in_sequence,
    )


def assign_library_assets_to_planned_slides(
    plan: CaptionPlan,
    assets: list[LibrarySlideAsset],
    *,
    usage_penalty: float = 0.075,
    consecutive_same_penalty: float = 0.05,
) -> list[tuple[LibrarySlideAsset, float]]:
    if not assets:
        raise ValueError("assign_library_assets_to_planned_slides requires non-empty assets")
    n = plan.num_slides
    if n < 1:
        return []
    usage: dict[Path, int] = {a.path: 0 for a in assets}
    out: list[tuple[LibrarySlideAsset, float]] = []
    prev: LibrarySlideAsset | None = None
    for k in range(1, n + 1):
        slide = plan.slides[k - 1]
        best_a: LibrarySlideAsset | None = None
        best_adjusted = -1e9
        best_raw = -1e9
        for a in assets:
            raw = score_planned_slide_vs_library_asset(
                slide.shot_direction,
                slide.caption,
                k,
                n,
                a,
            )
            adj = raw - usage_penalty * usage[a.path]
            if prev is not None and a.path == prev.path:
                adj -= consecutive_same_penalty
            if adj > best_adjusted:
                best_adjusted = adj
                best_raw = raw
                best_a = a
        assert best_a is not None
        usage[best_a.path] += 1
        prev = best_a
        out.append((best_a, best_raw))
    return out


def crop_to_vertical_9_16(img: PILImage.Image) -> PILImage.Image:
    """Center-crop to 9:16 (TikTok-style portrait)."""
    img = img.convert("RGB")
    iw, ih = img.size
    if iw <= 0 or ih <= 0:
        return img
    target = 9 / 16
    ir = iw / ih
    if ir > target:
        new_w = max(1, int(round(ih * target)))
        left = (iw - new_w) // 2
        img = img.crop((left, 0, left + new_w, ih))
    elif ir < target:
        new_h = max(1, int(round(iw / target)))
        top = (ih - new_h) // 2
        img = img.crop((0, top, iw, top + new_h))
    return img


def downscale_long_edge(img: PILImage.Image, long_edge: int) -> PILImage.Image:
    w, h = img.size
    m = max(w, h)
    if m <= long_edge:
        return img
    scale = long_edge / m
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return img.resize((nw, nh), PILImage.Resampling.LANCZOS)


def write_library_frames_to_raw_dir(
    assignments: list[tuple[LibrarySlideAsset, float]],
    raw_dir: Path,
    *,
    long_edge: int = 1920,
) -> list[Path]:
    """Load each assigned path, crop 9:16, optionally downscale; save ``frame_XX.png`` under ``raw_dir``."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    for i, (asset, _score) in enumerate(assignments, start=1):
        base = PILImage.open(asset.path).convert("RGB")
        base = crop_to_vertical_9_16(base)
        base = downscale_long_edge(base, long_edge)
        outp = raw_dir / f"frame_{i:02d}.png"
        base.save(outp, format="PNG")
        out.append(outp)
    return out


__all__ = [
    "LibrarySlideAsset",
    "assign_library_assets_to_planned_slides",
    "crop_to_vertical_9_16",
    "describe_input_image_openai",
    "downscale_long_edge",
    "inspiration_asset_to_library_asset",
    "input_path_to_library_asset",
    "input_path_to_library_asset_with_notes",
    "score_planned_slide_vs_library_asset",
    "write_library_frames_to_raw_dir",
]
