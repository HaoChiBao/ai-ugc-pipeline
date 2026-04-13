"""
FastAPI service: Gemini image generation in the style of ai-music-assembler
(`extend_backgrounds.py` — generate_content with text + PIL images + ImageConfig).

Stores reference uploads under data/uploads/<session_id>/ and outputs under
data/generated/<session_id>/. Serves files at /static/...
"""

from __future__ import annotations

import io
import os
import uuid
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image as PILImage

load_dotenv()

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
UPLOADS = DATA_DIR / "uploads"
GENERATED = DATA_DIR / "generated"
PUBLIC_BASE = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

# StaticFiles requires this directory to exist at import time (before lifespan runs).
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS.mkdir(parents=True, exist_ok=True)
GENERATED.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
DEFAULT_ASPECT = os.environ.get("GEMINI_ASPECT_RATIO", "9:16")
DEFAULT_SIZE = os.environ.get("GEMINI_IMAGE_SIZE", "2K")


app = FastAPI(title="Slide image generator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _iter_response_parts(response) -> list:
    parts = getattr(response, "parts", None)
    if parts:
        return list(parts)
    out = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        if content and getattr(content, "parts", None):
            out.extend(content.parts)
    return out


def _to_pil_image(im) -> PILImage.Image:
    if isinstance(im, PILImage.Image):
        return im
    data = getattr(im, "image_bytes", None)
    if data:
        return PILImage.open(io.BytesIO(data)).convert("RGB")
    raise TypeError(f"Cannot convert image part: {type(im)!r}")


def _save_first_image(response, out_path: Path) -> bool:
    for part in _iter_response_parts(response):
        raw = part.as_image()
        if raw is not None:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            im = _to_pil_image(raw)
            im.save(out_path)
            return True
    return False


def _response_debug_text(response) -> str:
    lines: list[str] = []
    for part in _iter_response_parts(response):
        t = getattr(part, "text", None)
        if t:
            lines.append(t[:2000])
    return "\n".join(lines) if lines else "(no text parts)"


app.mount(
    "/static",
    StaticFiles(directory=str(DATA_DIR), check_dir=True),
    name="static",
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/generate-slides")
async def generate_slides(
    prompt: str = Form(..., description="What the slide series should convey"),
    num_slides: int = Form(4, ge=1, le=12),
    aspect_ratio: str = Form(DEFAULT_ASPECT),
    image_size: str = Form(DEFAULT_SIZE),
    model: str = Form(DEFAULT_MODEL),
    images: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    """
    Accepts 0–8 reference images. Saves them under uploads/<session_id>/.
    For each slide, calls Gemini (image model) with references + prompt, like
    ai-music-assembler extend_backgrounds (master prompt + source image).
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Missing GEMINI_API_KEY (or GOOGLE_API_KEY) in environment",
        )

    if image_size not in ("512", "1K", "2K", "4K"):
        raise HTTPException(status_code=400, detail="image_size must be 512, 1K, 2K, or 4K")

    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise HTTPException(status_code=500, detail="google-genai not installed") from e

    session_id = str(uuid.uuid4())
    session_upload = UPLOADS / session_id
    session_out = GENERATED / session_id
    session_upload.mkdir(parents=True, exist_ok=True)
    session_out.mkdir(parents=True, exist_ok=True)

    upload_list = images or []
    ref_paths: list[Path] = []
    for i, up in enumerate(upload_list[:8]):
        raw = await up.read()
        if not raw:
            continue
        ext = Path(up.filename or f"ref_{i}").suffix.lower()
        if ext not in (".png", ".jpg", ".jpeg", ".webp", ""):
            ext = ".png"
        dest = session_upload / f"ref_{i:02d}{ext if ext else '.png'}"
        dest.write_bytes(raw)
        ref_paths.append(dest)

    pil_refs: list[PILImage.Image] = []
    for p in ref_paths:
        try:
            pil_refs.append(PILImage.open(p).convert("RGB"))
        except Exception:
            continue

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=image_size,
        ),
    )

    slides_out: list[dict] = []
    for k in range(1, num_slides + 1):
        slide_instruction = (
            f"{prompt.strip()}\n\n"
            f"Create slide {k} of {num_slides} for a vertical social-media slideshow. "
            "Single full-frame image only. Do not render captions, logos, or overlay text in the image. "
            "Match the mood and subject matter of the reference image(s) when provided."
        )
        contents: list = [slide_instruction]
        contents.extend(pil_refs)

        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {e!s}") from e

        out_name = f"slide_{k:02d}.png"
        out_path = session_out / out_name
        if not _save_first_image(response, out_path):
            dbg = _response_debug_text(response)
            raise HTTPException(
                status_code=502,
                detail=f"No image in model response for slide {k}. {dbg[:500]}",
            )

        rel = f"/static/generated/{session_id}/{out_name}"
        slides_out.append(
            {
                "index": k,
                "path": rel,
                "url": f"{PUBLIC_BASE}{rel}",
            }
        )

    return {
        "session_id": session_id,
        "base_url": PUBLIC_BASE,
        "model": model,
        "aspect_ratio": aspect_ratio,
        "image_size": image_size,
        "upload_dir": str(session_upload.relative_to(DATA_DIR)),
        "slides": slides_out,
    }
