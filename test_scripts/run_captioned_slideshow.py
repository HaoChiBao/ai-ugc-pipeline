#!/usr/bin/env python3
"""Alias for :mod:`run_slideshow_gen` — same behavior (captions + random images, no image gen)."""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from tiktok_slideshow_gen.captioned_slideshow_runner import main

if __name__ == "__main__":
    raise SystemExit(main())
