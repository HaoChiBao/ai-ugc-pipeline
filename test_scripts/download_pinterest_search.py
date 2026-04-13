#!/usr/bin/env python3
"""
Download images from Pinterest using **gallery-dl** (see ``requirements.txt``).

**Related / “similar” pins** (what you see beside a pin when you open it):

Pass a **pin URL** as the first argument. The script uses gallery-dl’s
``https://www.pinterest.com/pin/ID/#related`` extractor (Pinterest’s
``RelatedPinFeed``), which matches the in-app “more like this” rail.

Supported pin references:

- ``https://www.pinterest.com/pin/1234567890/`` (any ``pinterest.<tld>``)
- ``https://pin.it/xxxxx`` short links (resolved via redirect)

**Keyword search** (plain text, not a URL):

Pass a normal search phrase to download from the pin search results page.

Each run writes ``image_links.txt`` in the output folder (tab-separated
``saved_file``, ``image_url``, ``pin_url``).

If Pinterest blocks requests, use ``--cookies-from-browser chrome`` (gallery-dl).

Examples::

    cd test_scripts
    .\\venv\\Scripts\\python.exe download_pinterest_search.py "cozy desk aesthetic"
    .\\venv\\Scripts\\python.exe download_pinterest_search.py \\
        "https://www.pinterest.com/pin/5136987070236871/" --count 15
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests

_SCRIPT_DIR = Path(__file__).resolve().parent
_DEFAULT_PARENT = _SCRIPT_DIR / "pinterest_downloads"
_LINKS_FILENAME = "image_links.txt"
_AFTER_LINKS_FMT = (
    "after:{category}_{id}{media_id|page_id:?_//}.{extension}\t{url}\t"
    "https://www.pinterest.com/pin/{id}/"
)

# Pin page on any pinterest.* host (id matches gallery-dl’s pin pattern)
_PIN_ID_IN_URL = re.compile(
    r"https?://(?:\w+\.)?pinterest\.[^/]+/pin/([^/?#\s]+)",
    re.IGNORECASE,
)
_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}


def _safe_dir_name(query: str) -> str:
    s = query.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[-\s]+", "_", s).strip("_")
    return s or "search"


def _search_url(query: str) -> str:
    return f"https://www.pinterest.com/search/pins/?q={quote_plus(query.strip())}"


def _related_feed_url(pin_id: str) -> str:
    """URL gallery-dl uses for PinterestRelatedPinExtractor."""
    return f"https://www.pinterest.com/pin/{pin_id}/#related"


def _normalize_pin_input(raw: str) -> str:
    s = raw.strip()
    if s.startswith("pin.it/") or s.startswith("//pin.it/"):
        s = "https://" + s.lstrip("/")
    return s


def _is_probably_pin_link(raw: str) -> bool:
    s = _normalize_pin_input(raw).lower()
    if "pin.it/" in s or s.startswith("https://pin.it/"):
        return True
    if "pinterest." in s and "/pin/" in s:
        return True
    return False


def _extract_pin_id_from_pinterest_url(url: str) -> str | None:
    m = _PIN_ID_IN_URL.search(url.strip())
    return m.group(1) if m else None


def resolve_pin_id(user_input: str) -> str | None:
    """
    Return numeric pin id from a pin URL, pin.it short link, or None.
    """
    s = _normalize_pin_input(user_input.strip())
    if not s.startswith("http"):
        if "pin.it/" in s or s.startswith("pin.it/"):
            s = "https://" + s.lstrip("/")

    host = urlparse(s).netloc.lower()
    if host == "pin.it" or host.endswith(".pin.it"):
        try:
            r = requests.get(
                s,
                allow_redirects=True,
                timeout=45,
                headers=_HTTP_HEADERS,
            )
            r.raise_for_status()
            return _extract_pin_id_from_pinterest_url(r.url)
        except requests.RequestException:
            return None

    return _extract_pin_id_from_pinterest_url(s)


def run_gallery_dl(
    target_urls: list[str],
    out: Path,
    *,
    count: int | None = None,
    cookies_from_browser: str | None = None,
    quiet: bool = False,
) -> int:
    links_path = out / _LINKS_FILENAME
    if links_path.exists():
        links_path.unlink()
    links_path.write_text(
        "saved_file\timage_url\tpin_url\n",
        encoding="utf-8",
    )

    cmd: list[str] = [
        sys.executable,
        "-m",
        "gallery_dl",
        "-D",
        str(out),
        "--Print-to-file",
        _AFTER_LINKS_FMT,
        str(links_path),
    ]
    if count is not None:
        cmd.extend(["--range", f"1-{count}"])
    if quiet:
        cmd.append("-q")
    if cookies_from_browser:
        cmd.extend(["--cookies-from-browser", cookies_from_browser])
    cmd.extend(target_urls)

    proc = subprocess.run(cmd, cwd=str(_SCRIPT_DIR))
    return int(proc.returncode)


def download_text_search(
    query: str,
    *,
    count: int,
    out: Path,
    open_browser: bool = False,
    cookies_from_browser: str | None = None,
    quiet: bool = False,
) -> int:
    """Download the first ``count`` images from a keyword pin search."""
    out.mkdir(parents=True, exist_ok=True)
    url = _search_url(query)
    if open_browser:
        webbrowser.open(url)
    print(
        f"Saving up to {count} image(s) to:\n  {out}\n"
        f"Link index:\n  {out / _LINKS_FILENAME}\n"
        f"Search URL:\n  {url}\n",
        flush=True,
    )
    return run_gallery_dl(
        [url],
        out,
        count=count,
        cookies_from_browser=cookies_from_browser,
        quiet=quiet,
    )


def download_related_pins(
    pin_id: str,
    *,
    count: int,
    out: Path,
    open_browser: bool = False,
    cookies_from_browser: str | None = None,
    quiet: bool = False,
) -> int:
    """Download up to ``count`` images from Pinterest’s related-pin feed."""
    out.mkdir(parents=True, exist_ok=True)
    related = _related_feed_url(pin_id)
    pin_page = f"https://www.pinterest.com/pin/{pin_id}/"
    if open_browser:
        webbrowser.open(pin_page)
    print(
        f"Saving up to {count} related / similar pin image(s) to:\n  {out}\n"
        f"Link index:\n  {out / _LINKS_FILENAME}\n"
        f"Source pin:\n  {pin_page}\n"
        f"Related feed (gallery-dl):\n  {related}\n",
        flush=True,
    )
    return run_gallery_dl(
        [related],
        out,
        count=count,
        cookies_from_browser=cookies_from_browser,
        quiet=quiet,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Download from Pinterest: keyword search, or similar pins for a pin URL "
            "(#related / RelatedPinFeed)."
        ),
    )
    parser.add_argument(
        "query",
        help=(
            "Either a Pinterest pin URL / pin.it link (downloads *related* pins), "
            "or a text search phrase."
        ),
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        metavar="N",
        help="Number of images to download (default: 10).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help=f"Output directory (default under {_DEFAULT_PARENT}/).",
    )
    parser.add_argument(
        "--open-browser",
        action="store_true",
        help="Open the Pinterest page in the default browser (pin page or search).",
    )
    parser.add_argument(
        "--cookies-from-browser",
        metavar="SPEC",
        default=None,
        help="Forwarded to gallery-dl, e.g. chrome, firefox, edge.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Pass -q to gallery-dl.",
    )
    args = parser.parse_args()

    if args.count < 1:
        parser.error("--count must be at least 1")

    raw = args.query.strip()
    pin_id: str | None = None
    if _is_probably_pin_link(raw):
        pin_id = resolve_pin_id(raw)

    if args.out_dir is not None:
        out = args.out_dir.expanduser().resolve()
    elif pin_id:
        out = (_DEFAULT_PARENT / f"related_pin_{pin_id}").resolve()
    else:
        out = (_DEFAULT_PARENT / _safe_dir_name(raw)).resolve()

    if pin_id:
        return download_related_pins(
            pin_id,
            count=args.count,
            out=out,
            open_browser=args.open_browser,
            cookies_from_browser=args.cookies_from_browser,
            quiet=args.quiet,
        )

    if _is_probably_pin_link(raw) and pin_id is None:
        print(
            "That looks like a pin link, but no pin id could be resolved. "
            "Use a full https://www.pinterest.*/pin/<digits>/ URL, or check the short link.\n",
            file=sys.stderr,
        )
        return 1

    return download_text_search(
        raw,
        count=args.count,
        out=out,
        open_browser=args.open_browser,
        cookies_from_browser=args.cookies_from_browser,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    raise SystemExit(main())
