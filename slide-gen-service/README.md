# Slide image service (FastAPI + Gemini)

Generates vertical slide images the same way as [ai-music-assembler](https://github.com/HaoChiBao/ai-music-assembler) `extend_backgrounds`: Gemini `generate_content` with a text prompt plus reference PIL images and `ImageConfig` (aspect ratio + size).

- **Input:** multipart form — `prompt`, `num_slides`, optional `images[]` files.
- **Output:** PNGs under `data/generated/<session_id>/`, originals under `data/uploads/<session_id>/`.
- **HTTP:** `GET /static/generated/...` serves files. `POST /v1/generate-slides` returns JSON with `slides[].url`.

## Run

```bash
cd slide-gen-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env   # add GEMINI_API_KEY
uvicorn main:app --reload --port 8000
```

The Next.js app proxies to this service when you use **AI Studio → “Python slide images”**. Set in `client/.env.local`:

- `SLIDE_GEN_SERVICE_URL=http://127.0.0.1:8000` (server-side proxy)
- `NEXT_PUBLIC_SLIDE_GEN_SERVICE_URL=http://127.0.0.1:8000` (browser `<img>` URLs)
