"""
FastAPI surface for test_scripts pipelines.

Run from ``test_scripts`` so imports and subprocess CLIs resolve::

    cd test_scripts
    source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn api_server.app:app --reload --reload-dir api_server --host 127.0.0.1 --port 8765

Without ``--reload-dir api_server``, reload watches the whole cwd (including ``.venv``).
Edits or cache writes under ``site-packages`` then trigger endless reloads.

Artifacts are written under ``api_runs/<job_id>/`` and exposed at ``GET /runs/<job_id>/...``.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .config import API_RUNS_DIR, TEST_SCRIPTS_DIR
from .runners import (
    build_job_response,
    file_as_base64,
    job_dir,
    new_job_id,
    run_analyze_tiktok_job,
    run_captioned_slideshow,
    run_categorize_job,
    run_library_compose_pipeline_job,
    run_photoreal_batch_job,
    run_pinterest_job,
    run_text_overlay_job,
    write_job_meta,
)

app = FastAPI(
    title="AI UGC test_scripts API",
    description=(
        "HTTP wrappers for TikTok/slideshow/Pinterest utilities in test_scripts. "
        "Prefer `download_urls` for large binaries; use `GET /v1/jobs/{id}/base64` for inline data."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_RUNS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/runs", StaticFiles(directory=str(API_RUNS_DIR)), name="runs")


def _base(request: Request) -> str:
    return str(request.base_url)


async def _read_upload_pairs(files: list[UploadFile] | None) -> list[tuple[str, bytes]]:
    if not files:
        return []
    out: list[tuple[str, bytes]] = []
    for uf in files:
        if not uf.filename:
            continue
        data = await uf.read()
        out.append((uf.filename, data))
    return out


# --- JSON bodies ---


class PinterestDownloadBody(BaseModel):
    query: str = Field(..., description="Search phrase or Pinterest / pin.it URL")
    count: int = Field(10, ge=1, le=200)
    cookies_from_browser: str | None = Field(
        None,
        description="gallery-dl flag value, e.g. chrome, firefox",
    )


class TikTokAnalyzeBody(BaseModel):
    url: str
    openai_model: str | None = None
    image_detail: Literal["low", "high", "auto"] = "low"
    skip_download: bool = False


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "test_scripts": str(TEST_SCRIPTS_DIR)}


@app.get("/v1/jobs/{job_id}")
async def get_job(job_id: str, request: Request) -> dict:
    root = job_dir(job_id)
    if not root.is_dir():
        raise HTTPException(404, "job not found")
    return build_job_response(
        job_id,
        exit_code=0,
        base_url=_base(request),
    )


@app.get("/v1/jobs/{job_id}/base64")
async def get_job_file_base64(
    job_id: str,
    path: str = Query(..., description="Path relative to job root, e.g. output/slide_01.png"),
) -> dict:
    root = job_dir(job_id)
    if not root.is_dir():
        raise HTTPException(404, "job not found")
    data_url, err = file_as_base64(job_id, path)
    if err:
        raise HTTPException(400, err)
    return {"path": path, "data_url": data_url}


@app.post("/v1/slideshow/captioned")
async def post_captioned_slideshow(
    request: Request,
    prompt: Annotated[str, Form()],
    provider: Annotated[str, Form()] = "openai",
    model: Annotated[str | None, Form()] = None,
    seed: Annotated[int | None, Form()] = None,
    fixed_layout: Annotated[bool, Form()] = False,
    caption_style: Annotated[str, Form()] = "stroke",
    no_text_overlay: Annotated[str, Form()] = "false",
    images: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    job_id = new_job_id()
    uploads = await _read_upload_pairs(images)
    skip_overlay = no_text_overlay.strip().lower() in ("1", "true", "yes", "on")

    def _run() -> tuple[int, str, str]:
        return run_captioned_slideshow(
            job_id,
            prompt=prompt,
            provider=provider,
            model=model or None,
            seed=seed,
            fixed_layout=fixed_layout,
            caption_style=caption_style,
            input_image_bytes=uploads or None,
            no_text_overlay=skip_overlay,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    body = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=body)
    return body


@app.post("/v1/overlay/text")
async def post_text_overlay(
    request: Request,
    image: Annotated[UploadFile, File()],
    text: Annotated[str, Form()],
    caption_style: Annotated[str, Form()] = "stroke",
    v_anchor: Annotated[str, Form()] = "bottom",
    h_anchor: Annotated[str, Form()] = "center",
    shift_x: Annotated[float, Form()] = 0.0,
    shift_y: Annotated[float, Form()] = 0.0,
    margin_x: Annotated[float, Form()] = 0.06,
    margin_y: Annotated[float, Form()] = 0.11,
    font_size_ratio: Annotated[float, Form()] = 0.048,
    no_shadow: Annotated[bool, Form()] = False,
    no_label_lowercase: Annotated[bool, Form()] = False,
) -> dict:
    if not image.filename:
        raise HTTPException(400, "image file required")
    job_id = new_job_id()
    raw = await image.read()

    def _run() -> tuple[int, str, str]:
        return run_text_overlay_job(
            job_id,
            image_bytes=raw,
            filename=image.filename or "upload.png",
            text=text,
            caption_style=caption_style,
            v_anchor=v_anchor,
            h_anchor=h_anchor,
            shift_x=shift_x,
            shift_y=shift_y,
            margin_x=margin_x,
            margin_y=margin_y,
            font_size_ratio=font_size_ratio,
            no_shadow=no_shadow,
            no_label_lowercase=no_label_lowercase,
        )

    code, out, err = await run_in_threadpool(_run)
    err_msg = err if code != 0 else None
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err, error=err_msg)
    body = build_job_response(
        job_id,
        exit_code=code,
        base_url=_base(request),
        stdout=out,
        stderr=err,
        error=err_msg,
    )
    if code != 0:
        raise HTTPException(status_code=500, detail=body)
    return body


@app.post("/v1/photoreal/batch")
async def post_photoreal_batch(
    request: Request,
    prompt: Annotated[str, Form()],
    num_images: Annotated[int, Form()] = 4,
    seed: Annotated[int | None, Form()] = None,
    model: Annotated[str | None, Form()] = None,
    aspect_ratio: Annotated[str | None, Form()] = None,
    image_size: Annotated[str | None, Form()] = None,
    refs: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    job_id = new_job_id()
    uploads = await _read_upload_pairs(refs)
    if num_images < 1 or num_images > 32:
        raise HTTPException(400, "num_images must be 1–32")

    def _run() -> tuple[int, str, str]:
        return run_photoreal_batch_job(
            job_id,
            prompt=prompt,
            num_images=num_images,
            seed=seed,
            model=model,
            aspect_ratio=aspect_ratio,
            image_size=image_size,
            ref_image_bytes=uploads or None,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    resp = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=resp)
    return resp


@app.post("/v1/pinterest/download")
async def post_pinterest(body: PinterestDownloadBody, request: Request) -> dict:
    job_id = new_job_id()

    def _run() -> tuple[int, str, str]:
        return run_pinterest_job(
            job_id,
            query=body.query,
            count=body.count,
            cookies_from_browser=body.cookies_from_browser,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    resp = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=resp)
    return resp


@app.post("/v1/tiktok/analyze")
async def post_tiktok_analyze(body: TikTokAnalyzeBody, request: Request) -> dict:
    job_id = new_job_id()

    def _run() -> tuple[int, str, str]:
        return run_analyze_tiktok_job(
            job_id,
            url=body.url,
            openai_model=body.openai_model,
            image_detail=body.image_detail,
            skip_download=body.skip_download,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    resp = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=resp)
    return resp


@app.post("/v1/images/categorize")
async def post_categorize(
    request: Request,
    images: Annotated[list[UploadFile], File()],
    write_json: Annotated[bool, Form()] = False,
    recursive: Annotated[bool, Form()] = False,
    detail: Annotated[str, Form()] = "high",
    openai_model: Annotated[str | None, Form()] = None,
    skip_existing: Annotated[bool, Form()] = False,
) -> dict:
    if not images:
        raise HTTPException(400, "at least one file in `images`")
    job_id = new_job_id()
    uploads = await _read_upload_pairs(images)

    def _run() -> tuple[int, str, str]:
        return run_categorize_job(
            job_id,
            write_json=write_json,
            recursive=recursive,
            detail=detail,
            openai_model=openai_model,
            skip_existing=skip_existing,
            image_bytes=uploads,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    resp = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=resp)
    return resp


@app.post(
    "/v1/pipeline/library-compose",
    tags=["pipeline"],
    summary="TikTok themed slide pipeline (library compose)",
    description=(
        "Runs ``run_tiktok_themed_slide_pipeline.py``: OpenAI caption plan, semantic match "
        "to library images, 9:16 crop, stroke captions (no Gemini image generation). "
        "Upload optional ``vision_txts`` (``<stem>.txt`` from categorize_input_images) and/or "
        "``inspiration_zip`` (folder with ``tiktok_slideshow_manifest.json`` and ``slides/``)."
    ),
)
@app.post(
    "/v1/pipeline/themed-slides",
    tags=["pipeline"],
    summary="Alias: themed slide pipeline",
)
async def post_library_compose_pipeline(
    request: Request,
    prompt: Annotated[str, Form()],
    images: Annotated[list[UploadFile] | None, File()] = None,
    vision_txts: Annotated[list[UploadFile] | None, File()] = None,
    inspiration_manifests: Annotated[list[UploadFile] | None, File()] = None,
    inspiration_zip: Annotated[UploadFile | None, File()] = None,
    openai_model: Annotated[str | None, Form()] = None,
    seed: Annotated[int | None, Form()] = None,
    placement_seed: Annotated[int | None, Form()] = None,
    fixed_layout: Annotated[bool, Form()] = False,
    keep_raw: Annotated[bool, Form()] = False,
    no_phone_grade: Annotated[bool, Form()] = False,
    stroke_shadow: Annotated[bool, Form()] = False,
    no_shadow: Annotated[bool, Form()] = False,
    no_input_vision: Annotated[bool, Form()] = False,
    no_first_slide_person_rule: Annotated[bool, Form()] = False,
    font_size_ratio: Annotated[float, Form()] = 0.048,
    library_long_edge: Annotated[int, Form()] = 1920,
    library_vision_model: Annotated[str | None, Form()] = None,
    inspiration_slide_limit: Annotated[int, Form()] = 8,
    no_inspiration_slide_images: Annotated[bool, Form()] = False,
) -> dict:
    uploads = await _read_upload_pairs(images)
    vtxt = await _read_upload_pairs(vision_txts)
    manifests = await _read_upload_pairs(inspiration_manifests)
    zip_bytes: bytes | None = None
    if inspiration_zip is not None and inspiration_zip.filename:
        zip_bytes = await inspiration_zip.read()

    if not uploads and not zip_bytes:
        raise HTTPException(
            400,
            "Provide at least one file in `images` and/or upload `inspiration_zip` "
            "(e.g. a zipped TikTok analysis folder with slides).",
        )
    if inspiration_slide_limit < 0 or inspiration_slide_limit > 200:
        raise HTTPException(400, "inspiration_slide_limit must be 0–200 (0 = up to 200 slides)")

    job_id = new_job_id()

    def _run() -> tuple[int, str, str]:
        return run_library_compose_pipeline_job(
            job_id,
            prompt=prompt,
            openai_model=openai_model,
            seed=seed,
            placement_seed=placement_seed,
            fixed_layout=fixed_layout,
            keep_raw=keep_raw,
            no_phone_grade=no_phone_grade,
            stroke_shadow=stroke_shadow,
            no_shadow=no_shadow,
            no_input_vision=no_input_vision,
            no_first_slide_person_rule=no_first_slide_person_rule,
            font_size_ratio=font_size_ratio,
            library_long_edge=library_long_edge,
            library_vision_model=library_vision_model,
            inspiration_slide_limit=inspiration_slide_limit,
            no_inspiration_slide_images=no_inspiration_slide_images,
            image_bytes=uploads or None,
            vision_txt_bytes=vtxt or None,
            inspiration_manifest_bytes=manifests or None,
            inspiration_zip_bytes=zip_bytes,
        )

    code, out, err = await run_in_threadpool(_run)
    write_job_meta(job_id, exit_code=code, stdout=out, stderr=err)
    resp = build_job_response(job_id, exit_code=code, base_url=_base(request), stdout=out, stderr=err)
    if code != 0:
        raise HTTPException(status_code=500, detail=resp)
    return resp
