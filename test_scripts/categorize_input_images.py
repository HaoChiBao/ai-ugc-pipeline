#!/usr/bin/env python3
"""
Per-image OpenAI vision: write a human-readable .txt (and optional JSON) next to a chosen layout.

Walks an image folder, calls OpenAI vision once per file, and writes ``{stem}.txt`` under the output
folder (default: ``<input-dir>/vision_txts``). With ``--recursive``, relative paths are mirrored under
``out-dir`` (e.g. ``_raw/frame_01.png`` -> ``vision_txts/_raw/frame_01.txt``).

Requires OPENAI_API_KEY (see test_scripts/.env), same pattern as analyze_tiktok_slideshow.py.

Examples::

    cd test_scripts
    .\\venv\\Scripts\\python.exe categorize_input_images.py
    .\\venv\\Scripts\\python.exe categorize_input_images.py --input-dir finished_slides\\_raw \\
        --out-dir finished_slides\\vision_txts --recursive --write-json
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent

from tiktok_slideshow_gen.load_images import IMAGE_EXTENSIONS, list_image_paths

_JSON_SCHEMA_HINT = """Return a single JSON object with exactly these keys:
- "primary_category": string - main image type (e.g. product photo, selfie, landscape, screenshot, UGC, infographic).
- "secondary_category": string - subtype or secondary label (can be empty string if none).
- "scene_summary": string - 2-4 sentences on what the image shows overall.
- "subjects_and_objects": string - main subjects, props, setting, notable objects.
- "fine_details": string - small, easy-to-miss details: textures, tiny labels, background clutter, reflections, logos, UI chrome, fingerprints, sensor noise, etc.
- "composition_camera": string - framing, angle, focal feel, depth, rule of thirds, negative space.
- "lighting_and_color": string - light direction/quality, shadows, palette, white balance, grade.
- "on_screen_text": string - transcribe all visible text; use empty string if none.
- "mood_and_intent": string - emotional tone and likely purpose (why this image exists).
- "category_tags": array of strings - many short lowercase tags for filtering (e.g. "outdoor", "golden-hour", "running-shoes")."""


def _load_env() -> None:
    load_dotenv(_SCRIPT_DIR / ".env")
    load_dotenv(_SCRIPT_DIR.parent / "client" / ".env")


def _list_image_paths_recursive(input_dir: Path) -> list[Path]:
    if not input_dir.is_dir():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")
    paths: list[Path] = []
    for p in sorted(input_dir.rglob("*")):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            paths.append(p)
    return paths


def _collect_images(input_dir: Path, *, recursive: bool) -> list[Path]:
    if recursive:
        return _list_image_paths_recursive(input_dir)
    return list_image_paths(input_dir)


def _image_to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        mime = "image/jpeg"
    b64 = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _analyze_one_image(
    image_path: Path,
    *,
    model: str,
    image_detail: str,
) -> dict[str, Any]:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("Install openai: pip install openai") from e

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (see test_scripts/.env).")

    client = OpenAI(api_key=api_key)
    user_text = (
        "Analyze this single image in detail for a media cataloging pipeline.\n\n" + _JSON_SCHEMA_HINT
    )
    content: list[dict[str, Any]] = [
        {"type": "text", "text": user_text},
        {
            "type": "image_url",
            "image_url": {
                "url": _image_to_data_url(image_path),
                "detail": image_detail,
            },
        },
    ]
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You output only valid JSON matching the user schema. Be precise on fine_details.",
            },
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    raw = resp.choices[0].message.content
    if not raw:
        raise RuntimeError("OpenAI returned empty content")
    return json.loads(raw)


def _format_txt(analysis: dict[str, Any]) -> str:
    tags = analysis.get("category_tags") or []
    if isinstance(tags, list):
        tags_str = ", ".join(str(t) for t in tags)
    else:
        tags_str = str(tags)

    sections = [
        ("Primary category", analysis.get("primary_category", "")),
        ("Secondary category", analysis.get("secondary_category", "")),
        ("Scene summary", analysis.get("scene_summary", "")),
        ("Subjects & objects", analysis.get("subjects_and_objects", "")),
        ("Fine details", analysis.get("fine_details", "")),
        ("Composition & camera", analysis.get("composition_camera", "")),
        ("Lighting & color", analysis.get("lighting_and_color", "")),
        ("On-screen text", analysis.get("on_screen_text", "") or "(none)"),
        ("Mood & intent", analysis.get("mood_and_intent", "")),
        ("Category tags", tags_str),
    ]
    lines: list[str] = []
    for title, body in sections:
        lines.append(title)
        lines.append("-" * min(48, max(4, len(title) + 4)))
        lines.append(str(body).strip())
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _outputs_exist(
    out_txt: Path,
    *,
    write_json: bool,
    out_json: Path,
) -> bool:
    if not out_txt.is_file():
        return False
    if write_json and not out_json.is_file():
        return False
    return True


def main() -> int:
    _load_env()

    default_in = _SCRIPT_DIR / "input_images"

    parser = argparse.ArgumentParser(
        description="OpenAI vision: one analysis per image -> stem.txt (optional stem.analysis.json).",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=default_in,
        help=f"Folder of images (default: {default_in})",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output root for .txt / .json (default: <input-dir>/vision_txts)",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Include nested folders; mirror relative paths under --out-dir",
    )
    parser.add_argument(
        "--write-json",
        action="store_true",
        help="Also write {stem}.analysis.json next to each .txt",
    )
    parser.add_argument(
        "--detail",
        choices=("low", "high", "auto"),
        default="high",
        help="OpenAI image detail (default: high - more tokens, better fine detail)",
    )
    parser.add_argument(
        "--openai-model",
        default=None,
        help="Vision model (default: OPENAI_VISION_MODEL or gpt-4o)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip images whose output .txt (and .json if --write-json) already exist",
    )
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    out_root = args.out_dir
    if out_root is None:
        out_root = input_dir / "vision_txts"
    out_root = out_root.resolve()

    model = (args.openai_model or os.environ.get("OPENAI_VISION_MODEL") or "gpt-4o").strip()

    try:
        paths = _collect_images(input_dir, recursive=args.recursive)
    except (FileNotFoundError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    if not paths:
        print(f"error: no images in {input_dir}", file=sys.stderr)
        return 3

    ok = 0
    skipped = 0
    failed = 0

    for img_path in paths:
        rel = img_path.relative_to(input_dir)
        out_txt = out_root / rel.with_suffix(".txt")
        out_json = out_root / rel.with_suffix(".analysis.json")

        if args.skip_existing and _outputs_exist(out_txt, write_json=args.write_json, out_json=out_json):
            print(f"skip (exists): {rel}")
            skipped += 1
            continue

        out_txt.parent.mkdir(parents=True, exist_ok=True)
        print(f"analyze: {rel}")
        try:
            analysis = _analyze_one_image(img_path, model=model, image_detail=args.detail)
        except Exception as e:
            print(f"  failed: {e}", file=sys.stderr)
            failed += 1
            continue

        payload: dict[str, Any] = {
            "source_image": str(rel).replace("\\", "/"),
            **analysis,
        }
        out_txt.write_text(_format_txt(analysis), encoding="utf-8")
        if args.write_json:
            out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        ok += 1

    print(f"done: {ok} written, {skipped} skipped, {failed} failed -> {out_root}")
    return 0 if failed == 0 else 4


if __name__ == "__main__":
    raise SystemExit(main())
