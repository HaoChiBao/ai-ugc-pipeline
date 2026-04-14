from __future__ import annotations

import base64
import io
import json
import shutil
import subprocess
import sys
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from .config import API_RUNS_DIR, IMAGE_SUFFIXES, TEST_SCRIPTS_DIR

if str(TEST_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(TEST_SCRIPTS_DIR))

load_dotenv(TEST_SCRIPTS_DIR / ".env")
load_dotenv(TEST_SCRIPTS_DIR.parent / "client" / ".env")


def new_job_id() -> str:
    return uuid.uuid4().hex


def job_dir(job_id: str) -> Path:
    return (API_RUNS_DIR / job_id).resolve()


def ensure_job_dir(job_id: str) -> Path:
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _collect_files(job_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for f in sorted(job_root.rglob("*")):
        if not f.is_file():
            continue
        try:
            rel = f.relative_to(job_root)
        except ValueError:
            continue
        rel_s = str(rel).replace("\\", "/")
        if rel_s == "_api_meta.json" or rel_s.startswith("_api_meta"):
            continue
        mt: str | None = None
        suf = f.suffix.lower()
        if suf in IMAGE_SUFFIXES:
            mt = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }.get(suf, "application/octet-stream")
        rows.append({"path": rel_s, "size_bytes": f.stat().st_size, "media_type": mt})
    return rows


def _collect_manifests(job_root: Path) -> dict[str, Any]:
    names = (
        "caption_manifest.json",
        "slide_pipeline_manifest.json",
        "tiktok_slideshow_manifest.json",
    )
    out: dict[str, Any] = {}
    for f in job_root.rglob("*.json"):
        if f.name not in names:
            continue
        try:
            rel = str(f.relative_to(job_root)).replace("\\", "/")
            out[rel] = json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
    return out


def _links_file_text(job_root: Path) -> str | None:
    p = job_root / "image_links.txt"
    if p.is_file():
        return p.read_text(encoding="utf-8", errors="replace")
    return None


def write_job_meta(
    job_id: str,
    *,
    exit_code: int,
    stdout: str = "",
    stderr: str = "",
    error: str | None = None,
) -> None:
    root = job_dir(job_id)
    meta = {
        "exit_code": exit_code,
        "error": error,
        "stdout_tail": (stdout or "")[-4000:],
        "stderr_tail": (stderr or "")[-4000:],
    }
    (root / "_api_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def read_job_meta(job_id: str) -> dict[str, Any] | None:
    p = job_dir(job_id) / "_api_meta.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def build_job_response(
    job_id: str,
    *,
    exit_code: int,
    base_url: str,
    stdout: str = "",
    stderr: str = "",
    error: str | None = None,
) -> dict[str, Any]:
    root = job_dir(job_id)
    base = base_url.rstrip("/") + "/"
    files = _collect_files(root)
    urls = [f"{base}runs/{job_id}/{f['path']}" for f in files if f.get("media_type")]
    manifests = _collect_manifests(root)
    links = _links_file_text(root)
    stored = read_job_meta(job_id)
    if stored is not None:
        exit_code = int(stored.get("exit_code", exit_code))
        if stored.get("error"):
            error = str(stored["error"])
        stdout = str(stored.get("stdout_tail", stdout))
        stderr = str(stored.get("stderr_tail", stderr))
    return {
        "job_id": job_id,
        "ok": exit_code == 0 and error is None,
        "exit_code": exit_code,
        "error": error,
        "stdout": stdout[-8000:] if stdout else "",
        "stderr": stderr[-8000:] if stderr else "",
        "files": files,
        "download_urls": urls,
        "manifests": manifests,
        "pinterest_links_file": links,
    }


def _run_subprocess_script(script_name: str, argv: list[str]) -> tuple[int, str, str]:
    cmd = [sys.executable, str(TEST_SCRIPTS_DIR / script_name), *argv]
    proc = subprocess.run(
        cmd,
        cwd=str(TEST_SCRIPTS_DIR),
        capture_output=True,
        text=True,
        timeout=3600,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def run_captioned_slideshow(
    job_id: str,
    *,
    prompt: str,
    provider: str = "openai",
    model: str | None = None,
    seed: int | None = None,
    fixed_layout: bool = False,
    caption_style: str = "stroke",
    input_image_bytes: list[tuple[str, bytes]] | None = None,
    no_text_overlay: bool = False,
) -> tuple[int, str, str]:
    ensure_job_dir(job_id)
    out_dir = job_dir(job_id) / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    if input_image_bytes:
        in_dir = job_dir(job_id) / "input_text_images"
        in_dir.mkdir(parents=True, exist_ok=True)
        for name, data in input_image_bytes:
            safe = Path(name).name
            if not safe:
                continue
            (in_dir / safe).write_bytes(data)
        input_dir = in_dir
    else:
        input_dir = TEST_SCRIPTS_DIR / "input_text_images"

    argv: list[str] = [
        prompt,
        "--output-dir",
        str(out_dir),
        "--input-dir",
        str(input_dir),
        "--provider",
        provider,
        "--caption-style",
        caption_style,
    ]
    if model:
        argv.extend(["--model", model])
    if seed is not None:
        argv.extend(["--seed", str(seed)])
    if fixed_layout:
        argv.append("--fixed-layout")
    if no_text_overlay:
        argv.append("--no-text-overlay")

    from tiktok_slideshow_gen.captioned_slideshow_runner import main as cap_main

    # Captured print output would need io.StringIO redirect; keep simple: return code only
    code = cap_main(argv, prog="captioned_slideshow")
    return code, "", ""


def run_text_overlay_job(
    job_id: str,
    *,
    image_bytes: bytes,
    filename: str,
    text: str,
    caption_style: str = "stroke",
    v_anchor: str = "bottom",
    h_anchor: str = "center",
    shift_x: float = 0.0,
    shift_y: float = 0.0,
    margin_x: float = 0.06,
    margin_y: float = 0.11,
    font_size_ratio: float = 0.048,
    no_shadow: bool = False,
    no_label_lowercase: bool = False,
) -> tuple[int, str, str]:
    from PIL import Image as PILImage

    from tiktok_slideshow_gen.tiktok_label_overlay import draw_tiktok_label_text
    from tiktok_slideshow_gen.tiktok_text_overlay import TikTokTextStyle, draw_tiktok_text

    root = ensure_job_dir(job_id)
    out_path = root / "overlay_out.png"
    try:
        style = TikTokTextStyle(
            font_path=None,
            vertical_anchor=v_anchor,
            horizontal_anchor="center" if caption_style == "label" else h_anchor,
            margin_x_ratio=margin_x,
            margin_y_ratio=margin_y,
            shift_x_ratio=0.0 if caption_style == "label" else shift_x,
            shift_y_ratio=shift_y,
            font_size_ratio=font_size_ratio,
            shadow=not no_shadow,
        )
        img = PILImage.open(BytesIO(image_bytes)).convert("RGB")
        if caption_style == "label":
            out_img = draw_tiktok_label_text(
                img,
                text,
                style=style,
                lowercase=not no_label_lowercase,
            )
        else:
            out_img = draw_tiktok_text(img, text, style=style)
        out_img.save(out_path, format="PNG")
        return 0, f"Wrote {out_path}\n", ""
    except Exception as e:
        return 1, "", str(e)


def run_photoreal_batch_job(
    job_id: str,
    *,
    prompt: str,
    num_images: int = 4,
    seed: int | None = None,
    model: str | None = None,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    ref_image_bytes: list[tuple[str, bytes]] | None = None,
) -> tuple[int, str, str]:
    ensure_job_dir(job_id)
    out_dir = job_dir(job_id) / "output_images"
    out_dir.mkdir(parents=True, exist_ok=True)

    if ref_image_bytes:
        inp = job_dir(job_id) / "ref_images"
        inp.mkdir(parents=True, exist_ok=True)
        for name, data in ref_image_bytes:
            safe = Path(name).name
            if not safe:
                continue
            (inp / safe).write_bytes(data)
        input_dir = inp
    else:
        input_dir = TEST_SCRIPTS_DIR / "input_images"

    argv = [
        prompt,
        "--output-dir",
        str(out_dir),
        "--input-dir",
        str(input_dir),
        "--num-images",
        str(num_images),
    ]
    if seed is not None:
        argv.extend(["--seed", str(seed)])
    if model:
        argv.extend(["--model", model])
    if aspect_ratio:
        argv.extend(["--aspect-ratio", aspect_ratio])
    if image_size:
        argv.extend(["--image-size", image_size])

    return _run_subprocess_script("run_photoreal_batch.py", argv)


def run_pinterest_job(
    job_id: str,
    *,
    query: str,
    count: int = 10,
    cookies_from_browser: str | None = None,
) -> tuple[int, str, str]:
    import download_pinterest_search as dps

    root = ensure_job_dir(job_id)
    raw = query.strip()
    low = raw.lower()
    pin_like = "pin.it/" in low or ("pinterest." in low and "/pin/" in low)

    if pin_like:
        pin_id = dps.resolve_pin_id(raw)
        if not pin_id:
            return 2, "", "Could not resolve Pinterest pin id from URL"
        code = dps.download_related_pins(
            pin_id,
            count=count,
            out=root,
            cookies_from_browser=cookies_from_browser,
            quiet=True,
        )
        return code, "", ""

    code = dps.download_text_search(
        raw,
        count=count,
        out=root,
        cookies_from_browser=cookies_from_browser,
        quiet=True,
    )
    return code, "", ""


def run_analyze_tiktok_job(
    job_id: str,
    *,
    url: str,
    openai_model: str | None = None,
    image_detail: str = "low",
    skip_download: bool = False,
) -> tuple[int, str, str]:
    root = ensure_job_dir(job_id)
    analysis_dir = root / "analysis"
    analysis_dir.mkdir(parents=True, exist_ok=True)
    argv = [url, "--out-dir", str(analysis_dir), "--image-detail", image_detail]
    if openai_model:
        argv.extend(["--openai-model", openai_model])
    if skip_download:
        argv.append("--skip-download")
    return _run_subprocess_script("analyze_tiktok_slideshow.py", argv)


def run_categorize_job(
    job_id: str,
    *,
    write_json: bool = False,
    recursive: bool = False,
    detail: str = "high",
    openai_model: str | None = None,
    skip_existing: bool = False,
    image_bytes: list[tuple[str, bytes]],
) -> tuple[int, str, str]:
    if not image_bytes:
        return 2, "", "At least one image file is required"

    root = ensure_job_dir(job_id)
    in_dir = root / "images"
    in_dir.mkdir(parents=True, exist_ok=True)
    for name, data in image_bytes:
        safe = Path(name).name
        if not safe:
            continue
        (in_dir / safe).write_bytes(data)

    out_dir = root / "vision_txts"
    argv = ["--input-dir", str(in_dir), "--out-dir", str(out_dir), "--detail", detail]
    if write_json:
        argv.append("--write-json")
    if recursive:
        argv.append("--recursive")
    if openai_model:
        argv.extend(["--openai-model", openai_model])
    if skip_existing:
        argv.append("--skip-existing")

    return _run_subprocess_script("categorize_input_images.py", argv)


def _safe_extract_zip(zip_bytes: bytes, dest: Path) -> None:
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            name = info.filename
            if name.endswith("/") or not name.strip():
                continue
            parts = Path(name).parts
            if ".." in parts:
                raise ValueError(f"Unsafe zip entry: {name!r}")
            target = (dest / name).resolve()
            if not str(target).startswith(str(dest)):
                raise ValueError(f"Unsafe zip path: {name!r}")
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out_f:
                shutil.copyfileobj(src, out_f)


def run_library_compose_pipeline_job(
    job_id: str,
    *,
    prompt: str,
    openai_model: str | None = None,
    seed: int | None = None,
    placement_seed: int | None = None,
    fixed_layout: bool = False,
    keep_raw: bool = False,
    no_phone_grade: bool = False,
    stroke_shadow: bool = False,
    no_shadow: bool = False,
    no_input_vision: bool = False,
    no_first_slide_person_rule: bool = False,
    font_size_ratio: float = 0.048,
    library_long_edge: int = 1920,
    library_vision_model: str | None = None,
    inspiration_slide_limit: int = 8,
    no_inspiration_slide_images: bool = False,
    image_bytes: list[tuple[str, bytes]] | None = None,
    vision_txt_bytes: list[tuple[str, bytes]] | None = None,
    inspiration_manifest_bytes: list[tuple[str, bytes]] | None = None,
    inspiration_zip_bytes: bytes | None = None,
) -> tuple[int, str, str]:
    """
    Wraps ``run_tiktok_themed_slide_pipeline.py`` (compose-only: plan + match + crop + overlay).
    """
    root = ensure_job_dir(job_id)
    in_dir = root / "input_images"
    in_dir.mkdir(parents=True, exist_ok=True)
    if image_bytes:
        for name, data in image_bytes:
            safe = Path(name).name
            if not safe:
                continue
            (in_dir / safe).write_bytes(data)

    if inspiration_zip_bytes is not None:
        zip_root = root / "inspiration_from_zip"
        try:
            _safe_extract_zip(inspiration_zip_bytes, zip_root)
        except (zipfile.BadZipFile, ValueError) as e:
            return 2, "", f"inspiration_zip: {e}"

    manifest_paths: list[Path] = []
    if inspiration_manifest_bytes:
        mdir = root / "inspiration_manifests"
        mdir.mkdir(parents=True, exist_ok=True)
        for i, (name, data) in enumerate(inspiration_manifest_bytes):
            safe = Path(name).name if Path(name).name else f"manifest_{i}.json"
            if not safe.lower().endswith(".json"):
                safe = f"{safe}.json"
            mp = mdir / safe
            mp.write_bytes(data)
            manifest_paths.append(mp)

    vision_dir: Path | None = None
    if vision_txt_bytes:
        vd = root / "input_vision_txts"
        vd.mkdir(parents=True, exist_ok=True)
        for name, data in vision_txt_bytes:
            safe = Path(name).name
            if not safe.lower().endswith(".txt"):
                continue
            (vd / safe).write_bytes(data)
        vision_dir = vd

    out_dir = root / "finished"
    out_dir.mkdir(parents=True, exist_ok=True)

    argv = [prompt, "--input-dir", str(in_dir), "--output-dir", str(out_dir)]
    if openai_model:
        argv.extend(["--openai-model", openai_model])
    if seed is not None:
        argv.extend(["--seed", str(seed)])
    if placement_seed is not None:
        argv.extend(["--placement-seed", str(placement_seed)])
    if fixed_layout:
        argv.append("--fixed-layout")
    if keep_raw:
        argv.append("--keep-raw")
    if no_phone_grade:
        argv.append("--no-phone-grade")
    if stroke_shadow:
        argv.append("--stroke-shadow")
    if no_shadow:
        argv.append("--no-shadow")
    if no_input_vision:
        argv.append("--no-input-vision")
    if no_first_slide_person_rule:
        argv.append("--no-first-slide-person-rule")
    argv.extend(["--font-size-ratio", str(font_size_ratio)])
    argv.extend(["--library-long-edge", str(library_long_edge)])
    if library_vision_model:
        argv.extend(["--library-vision-model", library_vision_model])
    argv.extend(["--inspiration-slide-limit", str(inspiration_slide_limit)])
    if no_inspiration_slide_images:
        argv.append("--no-inspiration-slide-images")

    for mp in manifest_paths:
        argv.extend(["--inspiration-manifest", str(mp)])
    if inspiration_zip_bytes is not None:
        argv.extend(["--inspiration-dir", str(root / "inspiration_from_zip")])
    if vision_dir is not None:
        argv.extend(["--input-vision-dir", str(vision_dir)])

    return _run_subprocess_script("run_tiktok_themed_slide_pipeline.py", argv)


def file_as_base64(job_id: str, relative_path: str) -> tuple[str | None, str | None]:
    root = job_dir(job_id)
    target = (root / relative_path).resolve()
    if not str(target).startswith(str(root)):
        return None, "path escapes job directory"
    if not target.is_file():
        return None, "file not found"
    raw = target.read_bytes()
    b64 = base64.standard_b64encode(raw).decode("ascii")
    suf = target.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".json": "application/json",
        ".txt": "text/plain",
    }.get(suf, "application/octet-stream")
    return f"data:{mime};base64,{b64}", None
