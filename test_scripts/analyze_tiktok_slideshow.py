#!/usr/bin/env python3
"""
Download TikTok photo-slideshow images, analyze the sequence with OpenAI (vision),
and write a JSON manifest plus a human-readable .txt summary.

Requires:
  - OPENAI_API_KEY (see test_scripts/.env)
  - gallery-dl (pip install -r requirements.txt) — extracts carousel images from /photo/ URLs
  - yt-dlp — optional but recommended for title/description metadata (--skip-download only)

Example:
  python analyze_tiktok_slideshow.py "https://www.tiktok.com/@user/photo/7521862040948870405"
  # Writes under test_scripts/tiktok_slideshow_analysis/<aweme_id>_<username>/
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.tiktok.com/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

_ANALYSIS_JSON_INSTRUCTIONS = """Return a single JSON object with exactly these keys:
- "overall_purpose": string — what the slideshow is trying to accomplish for the viewer (1–3 sentences).
- "audience_and_context": string — who it seems aimed at and situational context (hashtags, niche).
- "narrative_arc": string — how the sequence builds from first slide to last (hook → middle → payoff/CTA).
- "tone_and_style": string — pacing, visual style, captioning patterns.
- "slides": array of objects, one per image in order, each with:
    - "index": integer (1-based, must match the slide order you were given)
    - "scene_summary": string — 1–3 sentences describing the slide
    - "on_screen_text": string — transcribe visible text; use empty string if none
    - "visual_elements": string — subjects, setting, composition, colors
    - "role_in_sequence": string — e.g. hook, tip, social proof, CTA, closer

The number of items in "slides" MUST equal the number of images provided ({n})."""


def _load_env() -> None:
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv(_SCRIPT_DIR.parent / "client" / ".env")


def _normalize_input_url(url: str) -> str:
    u = url.strip()
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


def _parse_aweme_id(url: str) -> str | None:
    m = re.search(r"/(?:photo|video)/(\d{10,})\b", url)
    return m.group(1) if m else None


def _parse_tiktok_handle(url: str) -> str | None:
    m = re.search(r"tiktok\.com/@([^/]+)/", url, re.I)
    if not m:
        return None
    return m.group(1).strip().lstrip("@")


def _sanitize_path_segment(name: str, *, max_len: int = 80) -> str:
    """Safe single path segment for Windows/macOS/Linux."""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    cleaned = cleaned.strip(" .")
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip(" .")
    return cleaned or "user"


def _default_analysis_dir_name(url: str, aweme_id: str) -> str:
    """Folder name: <video_id>_<tiktok_username> (filesystem-safe)."""
    handle = _parse_tiktok_handle(url) or "unknown_user"
    return f"{aweme_id}_{_sanitize_path_segment(handle)}"


def _video_url_from_tiktok(url: str) -> str | None:
    m = re.search(r"tiktok\.com/@([^/]+)/(?:photo|video)/(\d+)", url, re.I)
    if not m:
        return None
    handle, aweme = m.group(1), m.group(2)
    return f"https://www.tiktok.com/@{handle}/video/{aweme}"


def _slide_sort_key(path: Path) -> tuple[int, int, str]:
    m = re.search(r"_(\d+)(?:\s|\[)", path.name)
    if m:
        return (0, int(m.group(1)), path.name)
    return (1, 0, path.name)


def _collect_downloaded_images(search_root: Path) -> list[Path]:
    found: list[Path] = []
    for p in search_root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() in _IMAGE_EXTS:
            found.append(p)
    return sorted(found, key=_slide_sort_key)


def _run_gallery_dl(dest: Path, url: str) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "gallery_dl", "-d", str(dest), url]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"gallery-dl failed (exit {proc.returncode}): {err[:2000]}")


def _yt_dlp_meta(video_url: str) -> dict[str, Any]:
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--dump-json",
        "--skip-download",
        video_url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0 or not proc.stdout.strip():
        return {}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {}


def _oembed_meta(canonical_url: str) -> dict[str, Any]:
    try:
        r = requests.get(
            f"https://www.tiktok.com/oembed?url={quote(canonical_url, safe='')}",
            headers=BROWSER_HEADERS,
            timeout=20,
        )
        if not r.ok:
            return {}
        data = r.json()
        return {
            "title": data.get("title"),
            "author_name": data.get("author_name"),
            "thumbnail_url": data.get("thumbnail_url"),
        }
    except (requests.RequestException, json.JSONDecodeError, ValueError):
        return {}


def _image_to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        mime = "image/jpeg"
    b64 = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _analyze_with_openai(
    slide_paths: list[Path],
    *,
    context_lines: list[str],
    model: str,
    image_detail: str,
) -> dict[str, Any]:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("Install openai: pip install openai") from e

    import os

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (see test_scripts/.env).")

    n = len(slide_paths)
    client = OpenAI(api_key=api_key)

    intro = (
        "You are an expert short-form content analyst. The following images are consecutive "
        f"slides from one TikTok photo slideshow ({n} slides). "
        "Analyze the full sequence and each slide.\n\n"
        + "\n".join(context_lines)
        + "\n\n"
        + _ANALYSIS_JSON_INSTRUCTIONS.format(n=n)
    )

    content: list[dict[str, Any]] = [{"type": "text", "text": intro}]
    for i, p in enumerate(slide_paths, start=1):
        content.append({"type": "text", "text": f"Slide {i} of {n}:"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": _image_to_data_url(p),
                    "detail": image_detail,
                },
            }
        )

    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You output only valid JSON objects matching the user schema.",
            },
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    raw = resp.choices[0].message.content
    if not raw:
        raise RuntimeError("OpenAI returned empty content")
    return json.loads(raw)


def _write_text_report(manifest: dict[str, Any], path: Path) -> None:
    analysis = manifest.get("openai_analysis") or {}
    lines: list[str] = []
    lines.append("TikTok slideshow analysis")
    lines.append("=" * 60)
    lines.append(f"Source URL: {manifest.get('source_url', '')}")
    lines.append(f"Output directory: {manifest.get('output_directory', '')}")
    lines.append("")

    meta = manifest.get("post_metadata") or {}
    if meta.get("title"):
        lines.append(f"Title: {meta['title']}")
    if meta.get("description"):
        lines.append(f"Description: {meta['description']}")
    if meta.get("uploader"):
        lines.append(f"Creator: {meta['uploader']}")
    lines.append("")

    lines.append("Overall purpose")
    lines.append("-" * 40)
    lines.append(str(analysis.get("overall_purpose", "")).strip())
    lines.append("")

    lines.append("Audience and context")
    lines.append("-" * 40)
    lines.append(str(analysis.get("audience_and_context", "")).strip())
    lines.append("")

    lines.append("Narrative arc")
    lines.append("-" * 40)
    lines.append(str(analysis.get("narrative_arc", "")).strip())
    lines.append("")

    lines.append("Tone and style")
    lines.append("-" * 40)
    lines.append(str(analysis.get("tone_and_style", "")).strip())
    lines.append("")

    lines.append("Slides")
    lines.append("-" * 40)
    slides = analysis.get("slides") or []
    for s in slides:
        idx = s.get("index", "?")
        lines.append(f"\n[{idx}] {s.get('role_in_sequence', '')}")
        lines.append(f"    Summary: {s.get('scene_summary', '')}")
        ot = str(s.get("on_screen_text", "")).strip()
        if ot:
            lines.append(f"    On-screen text: {ot}")
        lines.append(f"    Visuals: {s.get('visual_elements', '')}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    _load_env()

    parser = argparse.ArgumentParser(
        description="Download a TikTok photo slideshow and analyze it with OpenAI vision.",
    )
    parser.add_argument("url", help="TikTok URL (/photo/ or /video/ for same aweme id)")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help=(
            "Output folder (default: test_scripts/tiktok_slideshow_analysis/"
            "<aweme_id>_<username>)"
        ),
    )
    parser.add_argument(
        "--openai-model",
        default=None,
        help="Vision-capable model (default: OPENAI_VISION_MODEL or gpt-4o)",
    )
    parser.add_argument(
        "--image-detail",
        choices=("low", "high", "auto"),
        default="low",
        help="OpenAI image detail (default: low — fewer tokens)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Reuse images already under <out-dir>/slides/ (expects slide_01.* …)",
    )
    args = parser.parse_args()

    raw_url = _normalize_input_url(args.url)
    aweme_id = _parse_aweme_id(raw_url)
    if not aweme_id:
        print("error: could not parse aweme id from URL", file=sys.stderr)
        return 2

    out_dir = args.out_dir
    tiktok_username = _parse_tiktok_handle(raw_url) or "unknown_user"
    analysis_dir_name = _default_analysis_dir_name(raw_url, aweme_id)
    if out_dir is None:
        out_dir = _SCRIPT_DIR / "tiktok_slideshow_analysis" / analysis_dir_name
    out_dir = out_dir.resolve()
    slides_dir = out_dir / "slides"
    gallery_staging = out_dir / "_gallery_dl_staging"

    import os

    model = (args.openai_model or os.environ.get("OPENAI_VISION_MODEL") or "gpt-4o").strip()

    if not args.skip_download:
        if gallery_staging.exists():
            shutil.rmtree(gallery_staging, ignore_errors=True)
        print("Downloading slideshow with gallery-dl…")
        _run_gallery_dl(gallery_staging, raw_url)
        downloaded = _collect_downloaded_images(gallery_staging)
        if not downloaded:
            print("error: no images found after download", file=sys.stderr)
            return 3
        if len(downloaded) > 20:
            print(f"warning: only analyzing first 20 of {len(downloaded)} images", file=sys.stderr)
            downloaded = downloaded[:20]

        slides_dir.mkdir(parents=True, exist_ok=True)
        for old in slides_dir.glob("slide_*"):
            old.unlink(missing_ok=True)

        normalized: list[dict[str, Any]] = []
        for i, src in enumerate(downloaded, start=1):
            ext = src.suffix.lower() if src.suffix else ".jpg"
            if ext not in _IMAGE_EXTS:
                ext = ".jpg"
            dest = slides_dir / f"slide_{i:02d}{ext}"
            shutil.copy2(src, dest)
            normalized.append(
                {
                    "index": i,
                    "file": dest.name,
                    "absolute_path": str(dest),
                    "source_gallery_dl_name": src.name,
                }
            )
        shutil.rmtree(gallery_staging, ignore_errors=True)
    else:
        if not slides_dir.is_dir():
            print(f"error: {slides_dir} missing; run without --skip-download first", file=sys.stderr)
            return 3
        paths = sorted(
            slides_dir.glob("slide_*.*"),
            key=lambda p: p.name,
        )
        downloaded = [p for p in paths if p.suffix.lower() in _IMAGE_EXTS]
        if not downloaded:
            print("error: no slide_* images in slides/", file=sys.stderr)
            return 3
        normalized = [
            {
                "index": i,
                "file": p.name,
                "absolute_path": str(p),
                "source_gallery_dl_name": None,
            }
            for i, p in enumerate(downloaded, start=1)
        ]

    video_url = _video_url_from_tiktok(raw_url) or raw_url
    print("Fetching post metadata (yt-dlp / oEmbed)…")
    meta: dict[str, Any] = {}
    ytd = _yt_dlp_meta(video_url)
    if ytd:
        meta = {
            "title": ytd.get("title"),
            "description": ytd.get("description"),
            "uploader": ytd.get("uploader"),
            "duration": ytd.get("duration"),
            "webpage_url": ytd.get("webpage_url"),
            "view_count": ytd.get("view_count"),
        }
    if not meta.get("title"):
        o = _oembed_meta(video_url) or _oembed_meta(raw_url)
        if o:
            meta = {**meta, **{k: v for k, v in o.items() if v}}

    context_lines = [
        "Post metadata (may be partial):",
        json.dumps(meta, ensure_ascii=False, indent=2),
    ]

    slide_paths = [slides_dir / row["file"] for row in normalized]
    print(f"OpenAI ({model}): analyzing {len(slide_paths)} slide(s)…")
    try:
        analysis = _analyze_with_openai(
            slide_paths,
            context_lines=context_lines,
            model=model,
            image_detail=args.image_detail,
        )
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 4

    manifest: dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_url": raw_url,
        "normalized_video_url": video_url,
        "aweme_id": aweme_id,
        "tiktok_username": tiktok_username,
        "analysis_folder_name": out_dir.name,
        "output_directory": str(out_dir),
        "post_metadata": meta,
        "openai_model": model,
        "slides": normalized,
        "openai_analysis": analysis,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "tiktok_slideshow_manifest.json"
    txt_path = out_dir / "tiktok_slideshow_analysis.txt"
    json_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    _write_text_report(manifest, txt_path)

    print(f"Wrote {json_path}")
    print(f"Wrote {txt_path}")
    print(f"Slides: {slides_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
