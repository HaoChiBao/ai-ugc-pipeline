"""Load analyzed TikTok slideshow manifests for pipeline inspiration (structure / tone / shots)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .caption_plan_llm import CaptionPlan

from PIL import Image as PILImage

from .load_images import list_image_paths

MANIFEST_FILENAME = "tiktok_slideshow_manifest.json"

# Used by ``run_tiktok_themed_slide_pipeline.py`` only in ``--full-generation`` mode (multi-ref path).
DEFAULT_MATCH_SCORE_THRESHOLD = 0.19


@dataclass
class InspirationSlideAsset:
    """One extracted slide image plus OpenAI analysis fields for matching and prompts."""

    path: Path
    pil: PILImage.Image
    slide_index: int
    post_folder: str
    scene_summary: str
    visual_elements: str
    role_in_sequence: str


def openai_analysis_from_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """Return the nested OpenAI analysis object (supports future ``analysis.openai_analysis``)."""
    wrapped = manifest.get("analysis")
    if isinstance(wrapped, dict):
        oa = wrapped.get("openai_analysis")
        if isinstance(oa, dict):
            return oa
    oa = manifest.get("openai_analysis")
    return oa if isinstance(oa, dict) else {}


def discover_manifest_paths_under(root: Path) -> list[Path]:
    """Every ``tiktok_slideshow_manifest.json`` under ``root`` (recursive), sorted for stability."""
    root = root.expanduser().resolve()
    if root.is_file():
        if root.name != MANIFEST_FILENAME:
            raise ValueError(f"Not a manifest file: {root}")
        return [root]
    if not root.is_dir():
        raise FileNotFoundError(f"Inspiration path not found: {root}")
    found = sorted(root.rglob(MANIFEST_FILENAME), key=lambda p: str(p).lower())
    return [p for p in found if p.is_file()]


def collect_inspiration_posts(
    *,
    manifest_files: list[Path],
    inspiration_dirs: list[Path],
) -> list[tuple[Path, dict[str, Any]]]:
    """
    Load unique posts as ``(manifest_path, manifest_dict)``.
    ``manifest_path.parent`` is the post folder (``slides/`` lives beside the manifest).
    """
    paths: list[Path] = []
    for mf in manifest_files:
        p = mf.expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"--inspiration-manifest not found: {p}")
        paths.append(p)
    for d in inspiration_dirs:
        paths.extend(discover_manifest_paths_under(d))

    seen: set[str] = set()
    unique_paths: list[Path] = []
    for p in paths:
        key = str(p.resolve())
        if key not in seen:
            seen.add(key)
            unique_paths.append(p.resolve())

    out: list[tuple[Path, dict[str, Any]]] = []
    for p in unique_paths:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            out.append((p.resolve(), data))
    return out


def _clip(s: str, max_len: int) -> str:
    t = (s or "").strip().replace("\n", " ")
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def collect_input_vision_notes(
    input_dir: Path,
    vision_root: Path,
) -> list[tuple[Path, str]]:
    """
    Pair each image under ``input_dir`` (non-recursive, same as reference picker) with
    ``vision_root / f"{stem}.txt"`` from ``categorize_input_images.py`` output.
    Returns sorted ``(image_path, note_text)`` for files where the .txt exists.
    """
    vision_root = vision_root.expanduser().resolve()
    if not vision_root.is_dir():
        raise NotADirectoryError(f"--input-vision-dir is not a directory: {vision_root}")
    input_dir = input_dir.resolve()
    if not input_dir.is_dir():
        raise FileNotFoundError(f"input dir not found: {input_dir}")
    pairs: list[tuple[Path, str]] = []
    for img in list_image_paths(input_dir):
        txt = vision_root / f"{img.stem}.txt"
        if not txt.is_file():
            continue
        try:
            text = txt.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        pairs.append((img, text))
    return sorted(pairs, key=lambda t: t[0].name.lower())


def format_input_vision_for_openai(
    pairs: list[tuple[Path, str]],
    *,
    max_files: int = 24,
    max_chars_per_note: int = 900,
) -> str:
    """Structured text for the caption planner: per-image vision notes (structure/tone reference only)."""
    if not pairs:
        return ""
    lines: list[str] = [
        "Notes below describe **reference stills** in `--input-dir` (from `categorize_input_images.py`). "
        "Use them to vary **shot_direction** so plans fit **real** subjects and settings available; "
        "**do not** paste long phrases as overlay captions. User topic stays primary.",
        "",
    ]
    for img_path, raw in pairs[:max_files]:
        lines.append(f"### {img_path.name}")
        note = (raw or "").strip()
        if len(note) > max_chars_per_note:
            note = note[: max_chars_per_note - 1].rstrip() + "..."
        lines.append(note)
        lines.append("")
    return "\n".join(lines).strip()


def format_input_vision_for_gemini(
    pairs: list[tuple[Path, str]],
    *,
    max_files: int = 12,
    max_chars_per_note: int = 320,
) -> str:
    """Short block appended to Gemini prompts: what identity/reference images depict."""
    if not pairs:
        return ""
    parts: list[str] = [
        "## Reference pool (precomputed vision notes)\n"
        "Subject-reference images (first in the multimodal stack) are described below. "
        "Match identity from those photos; align scene **types** with what they can support. "
        "Do not render any note text into pixels.\n",
    ]
    for img_path, raw in pairs[:max_files]:
        note = _clip((raw or "").replace("\n", " "), max_chars_per_note)
        if note:
            parts.append(f"- **{img_path.name}:** {note}\n")
    return "\n".join(parts).strip()


def format_inspiration_for_openai(
    posts: list[tuple[Path, dict[str, Any]]],
    *,
    max_posts: int = 5,
    max_slide_lines_per_post: int = 14,
) -> str:
    """
    Structured text for the caption planner: narrative, tone, per-slide roles and visuals.
    Omits sample ``on_screen_text`` to reduce verbatim copying.
    """
    if not posts:
        return ""
    lines: list[str] = []
    lines.append(
        "### Variety cue from samples\n"
        "When planning **shot_direction** for the user's topic, aim for a **similar spread of scene types** "
        "as in the per-slide lines below (e.g. in-car, watch/phone, empty scenery, macro props, home/gym), "
        "not only full-body athlete shots. Write **new** directions; do not quote sample on-screen text.",
    )
    lines.append("")
    for manifest_path, manifest in posts[:max_posts]:
        post_dir = manifest_path.parent
        oa = openai_analysis_from_manifest(manifest)
        if not oa:
            continue
        folder = manifest.get("analysis_folder_name") or post_dir.name
        user = manifest.get("tiktok_username") or ""
        url = manifest.get("source_url") or ""
        meta = manifest.get("post_metadata") if isinstance(manifest.get("post_metadata"), dict) else {}
        title = meta.get("title") if isinstance(meta, dict) else None
        lines.append(f"### Sample post folder: {folder}")
        if url:
            lines.append(f"- source_url: {url}")
        if user:
            lines.append(f"- tiktok_username: @{user}")
        if title:
            lines.append(f"- post title (context only): {_clip(str(title), 200)}")
        for key in (
            "overall_purpose",
            "audience_and_context",
            "narrative_arc",
            "tone_and_style",
        ):
            val = oa.get(key)
            if val:
                lines.append(f"- {key}: {_clip(str(val), 450)}")
        lines.append("- Per-slide (rhythm / composition hints; **do not** reuse sample overlay wording):")
        slide_rows = oa.get("slides") or []
        if isinstance(slide_rows, list):
            sorted_slides = sorted(
                slide_rows,
                key=lambda s: int(s.get("index", 0)) if isinstance(s, dict) else 0,
            )
            for s in sorted_slides[:max_slide_lines_per_post]:
                if not isinstance(s, dict):
                    continue
                idx = s.get("index", "?")
                role = _clip(str(s.get("role_in_sequence", "")), 120)
                scene = _clip(str(s.get("scene_summary", "")), 220)
                vis = _clip(str(s.get("visual_elements", "")), 220)
                lines.append(
                    f"  - Slide {idx}: role_in_sequence={role}; scene_summary={scene}; "
                    f"visual_elements={vis}",
                )
        lines.append("")
    return "\n".join(lines).strip()


def format_inspiration_for_gemini(
    posts: list[tuple[Path, dict[str, Any]]],
    slide_index: int,
    *,
    max_posts: int = 4,
) -> str:
    """
    Short block for one generated frame: global tone arc + matching sample slide visual/role if any.
    """
    if not posts:
        return ""
    parts: list[str] = []
    arc_bits: list[str] = []
    for _manifest_path, manifest in posts[:max_posts]:
        oa = openai_analysis_from_manifest(manifest)
        if not oa:
            continue
        na = oa.get("narrative_arc")
        ts = oa.get("tone_and_style")
        if na:
            arc_bits.append(_clip(str(na), 280))
        if ts:
            arc_bits.append(_clip(str(ts), 280))
    if arc_bits:
        merged = _clip(" | ".join(arc_bits), 600)
        parts.append(
            "## Reference carousel patterns (from analyzed TikTok samples)\n"
            f"Narrative / tone hints (do not copy sample text into the image): {merged}\n",
        )
    slide_hints: list[str] = []
    for manifest_path, manifest in posts[:max_posts]:
        post_dir = manifest_path.parent
        oa = openai_analysis_from_manifest(manifest)
        for s in oa.get("slides") or []:
            if not isinstance(s, dict):
                continue
            try:
                idx = int(s.get("index", -1))
            except (TypeError, ValueError):
                continue
            if idx != slide_index:
                continue
            role = _clip(str(s.get("role_in_sequence", "")), 100)
            vis = _clip(str(s.get("visual_elements", "")), 260)
            scene = _clip(str(s.get("scene_summary", "")), 200)
            label = manifest.get("analysis_folder_name") or post_dir.name
            slide_hints.append(
                f"- From sample `{label}` slide {idx}: role={role}; visuals={vis}; scene={scene}",
            )
    if slide_hints:
        parts.append(
            "## Sample slide alignment (this index only)\n"
            + "\n".join(slide_hints[:3])
            + "\nUse as loose visual/rhythm reference only; **no** sample captions in pixels.\n",
        )
    return "\n".join(parts).strip()


def load_inspiration_slide_images(
    posts: list[tuple[Path, dict[str, Any]]],
    *,
    max_slides_total: int = 8,
    max_slides_per_post: int = 8,
) -> tuple[list[Path], list[PILImage.Image]]:
    """
    Load RGB images from each post's ``slides/`` folder using ``manifest["slides"][].file``.

    Paths are resolved as ``manifest_dir/slides/<file>`` (portable; ignores stale ``absolute_path``).
    Stops when ``max_slides_total`` images have been loaded.
    """
    paths_out: list[Path] = []
    pil_out: list[PILImage.Image] = []
    for manifest_path, manifest in posts:
        if len(pil_out) >= max_slides_total:
            break
        post_dir = manifest_path.parent
        slides_dir = post_dir / "slides"
        rows = manifest.get("slides") or []
        if not isinstance(rows, list):
            continue
        sorted_rows = sorted(
            rows,
            key=lambda s: int(s.get("index", 0)) if isinstance(s, dict) else 0,
        )
        n_added = 0
        for s in sorted_rows:
            if len(pil_out) >= max_slides_total:
                break
            if n_added >= max_slides_per_post:
                break
            if not isinstance(s, dict):
                continue
            fname = s.get("file")
            if not fname:
                continue
            fp = (slides_dir / str(fname)).resolve()
            if not fp.is_file():
                continue
            try:
                pil_out.append(PILImage.open(fp).convert("RGB"))
                paths_out.append(fp)
                n_added += 1
            except OSError:
                continue
    return paths_out, pil_out


def load_inspiration_slide_assets(
    posts: list[tuple[Path, dict[str, Any]]],
    *,
    max_slides_total: int = 8,
    max_slides_per_post: int = 8,
) -> list[InspirationSlideAsset]:
    """
    Like :func:`load_inspiration_slide_images` but attaches ``scene_summary``, ``visual_elements``,
    ``role_in_sequence`` from ``openai_analysis.slides`` matched by 1-based index.
    """
    assets: list[InspirationSlideAsset] = []
    for manifest_path, manifest in posts:
        if len(assets) >= max_slides_total:
            break
        post_dir = manifest_path.parent
        folder = manifest.get("analysis_folder_name") or post_dir.name
        slides_dir = post_dir / "slides"
        rows = manifest.get("slides") or []
        oa = openai_analysis_from_manifest(manifest)
        oa_by_idx: dict[int, dict[str, Any]] = {}
        for os in oa.get("slides") or []:
            if not isinstance(os, dict):
                continue
            try:
                oa_by_idx[int(os.get("index", 0))] = os
            except (TypeError, ValueError):
                continue
        if not isinstance(rows, list):
            continue
        sorted_rows = sorted(
            rows,
            key=lambda s: int(s.get("index", 0)) if isinstance(s, dict) else 0,
        )
        n_added = 0
        for s in sorted_rows:
            if len(assets) >= max_slides_total:
                break
            if n_added >= max_slides_per_post:
                break
            if not isinstance(s, dict):
                continue
            fname = s.get("file")
            if not fname:
                continue
            try:
                idx = int(s.get("index", 0))
            except (TypeError, ValueError):
                continue
            fp = (slides_dir / str(fname)).resolve()
            if not fp.is_file():
                continue
            try:
                pil = PILImage.open(fp).convert("RGB")
            except OSError:
                continue
            oa_row = oa_by_idx.get(idx, {})
            assets.append(
                InspirationSlideAsset(
                    path=fp,
                    pil=pil,
                    slide_index=idx,
                    post_folder=folder,
                    scene_summary=str(oa_row.get("scene_summary", "") or ""),
                    visual_elements=str(oa_row.get("visual_elements", "") or ""),
                    role_in_sequence=str(oa_row.get("role_in_sequence", "") or ""),
                )
            )
            n_added += 1
    return assets


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


def score_planned_slide_vs_asset(
    shot_direction: str,
    caption: str,
    slide_k: int,
    total_slides: int,
    asset: InspirationSlideAsset,
) -> float:
    """Cheap similarity: planned text vs analysis blob + weak role alignment."""
    query = f"{shot_direction} {caption}".lower()
    blob = f"{asset.scene_summary} {asset.visual_elements} {asset.role_in_sequence}".lower()
    base = SequenceMatcher(None, query, blob).ratio()
    q_tokens = set(re.findall(r"[a-z]{4,}", query))
    b_tokens = set(re.findall(r"[a-z]{4,}", blob))
    overlap = len(q_tokens & b_tokens)
    return base + 0.035 * min(overlap, 14) + _role_alignment_boost(slide_k, total_slides, asset.role_in_sequence)


def pick_best_inspiration_asset(
    shot_direction: str,
    caption: str,
    slide_k: int,
    total_slides: int,
    assets: list[InspirationSlideAsset],
) -> tuple[InspirationSlideAsset | None, float]:
    if not assets:
        return None, 0.0
    best: InspirationSlideAsset | None = None
    best_score = -1.0
    for a in assets:
        s = score_planned_slide_vs_asset(shot_direction, caption, slide_k, total_slides, a)
        if s > best_score:
            best_score = s
            best = a
    return best, best_score


def assign_inspiration_assets_to_planned_slides(
    plan: CaptionPlan,
    assets: list[InspirationSlideAsset],
    *,
    usage_penalty: float = 0.075,
    consecutive_same_penalty: float = 0.05,
) -> list[tuple[InspirationSlideAsset, float]]:
    """
    After the caption plan exists, assign each slide **one** inspiration still to remaster.

    Scores reuse ``score_planned_slide_vs_asset``; penalties encourage **variety** when the pool
    allows it (discourage reusing the same source path for every slide and back-to-back repeats).
    """
    if not assets:
        raise ValueError("assign_inspiration_assets_to_planned_slides requires non-empty assets")
    n = plan.num_slides
    if n < 1:
        return []
    usage: dict[Path, int] = {a.path: 0 for a in assets}
    out: list[tuple[InspirationSlideAsset, float]] = []
    prev: InspirationSlideAsset | None = None
    for k in range(1, n + 1):
        slide = plan.slides[k - 1]
        best_a: InspirationSlideAsset | None = None
        best_adjusted = -1e9
        best_raw = -1e9
        for a in assets:
            raw = score_planned_slide_vs_asset(
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


__all__ = [
    "MANIFEST_FILENAME",
    "openai_analysis_from_manifest",
    "discover_manifest_paths_under",
    "collect_inspiration_posts",
    "collect_input_vision_notes",
    "format_input_vision_for_openai",
    "format_input_vision_for_gemini",
    "format_inspiration_for_openai",
    "format_inspiration_for_gemini",
    "load_inspiration_slide_images",
    "InspirationSlideAsset",
    "load_inspiration_slide_assets",
    "pick_best_inspiration_asset",
    "assign_inspiration_assets_to_planned_slides",
    "score_planned_slide_vs_asset",
    "DEFAULT_MATCH_SCORE_THRESHOLD",
]
