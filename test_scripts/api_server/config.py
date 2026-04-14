from __future__ import annotations

from pathlib import Path

TEST_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
API_RUNS_DIR = TEST_SCRIPTS_DIR / "api_runs"

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
