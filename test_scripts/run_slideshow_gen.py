#!/usr/bin/env python3
"""
TikTok-style slideshow: **OpenAI (or Gemini) generates theme + per-slide captions**;
**images are picked at random** from ``input_text_images/`` and captions are drawn on top.

This does **not** call any image-generation API (no Gemini image model, no DALL·E).

Example:

  cd test_scripts
  .venv\\Scripts\\activate
  pip install -r requirements.txt
  # OPENAI_API_KEY in .env (see .env.example)
  python run_slideshow_gen.py "Top 5 running tips for beginners"
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.captioned_slideshow_runner import main

if __name__ == "__main__":
    raise SystemExit(main())
