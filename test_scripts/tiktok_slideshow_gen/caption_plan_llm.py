"""Ask an LLM for TikTok slideshow theme, per-slide captions, and per-slide shot_direction briefs.

Overlay copy is **all-lowercase**. **First and last** slides use **short** GRWM-style lines; **middle** slides carry **fuller, substantive** on-screen copy (like classic value slides). ``shot_direction`` stays concrete for image generation.
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any


@dataclass
class CaptionSlide:
    # caption = overlay text; shot_direction = image brief only (hero vs B-roll, POV, props).
    caption: str
    shot_direction: str = ""


@dataclass
class CaptionPlan:
    num_slides: int
    theme_title: str
    theme_description: str
    slides: list[CaptionSlide]

    def captions_in_order(self) -> list[str]:
        return [s.caption.strip() for s in self.slides]

    def shot_directions_in_order(self) -> list[str]:
        return [s.shot_direction.strip() for s in self.slides]


_SYSTEM = """You are a TikTok slideshow copywriter in a **soft GRWM / quiet lifestyle** lane: **first and last** slides use **short**, pretty, whisper-soft lines; **middle** slides use **fuller** on-screen copy with real tips, steps, or truths (still soft and personal, not corporate).

## On-screen text: lowercase only (mandatory)
- **Every `caption` must be entirely lowercase** (a–z, numbers, spaces, apostrophes in contractions like "it's" / "i've"). **No** capital letters in captions. **No** ALL CAPS, **no** title case.
- **`theme_title` and `theme_description` must also be entirely lowercase** so the whole JSON plan matches this aesthetic.
- **`shot_direction` is exempt**—use normal sentence case there so the image model reads clear instructions.

## Caption length: first & last short, middle = real content (mandatory)
Apply **by slide index** (1-based). If **num_slides ≤ 2**, every caption is **short** (both act as bookends).

**slides[0] (first) and slides[num_slides-1] (last)—keep short:**
- **Soft GRWM / minimal:** one short phrase or line, often **about 3–10 words**, **airy**, whispery hook and whispery closer.
- Examples of the vibe: *little things that made my mornings better*, *products i keep reaching for*, *small habits that changed my routine*, *quiet wins this week*.
- **Not** long explanations on these two slides; they frame the carousel, they don't teach the whole story.

**Middle slides (slides[1] through slides[num_slides-2] when num_slides ≥ 3)—fuller overlay copy:**
- This is the **actual content**: **clear, readable, valuable** lines like **before** the ultra-minimal pass—one **real idea, tip, truth, or step per slide** (or two short sentences if the topic needs it).
- Aim roughly **12–28 words** often, or **up to ~240 characters** per middle caption so it feels **substantive on screen** (still scannable, not an essay).
- Still **lowercase**, still **soft** and peer-to-peer—**not** shouty listicle titles, **not** ALL CAPS—but **do** explain, persuade, or teach **here** the way a strong TikTok value slide would.

**Shared tone (all slides):**
- Gentle, pretty, unhurried; **you** and **i** both OK; avoid corporate jargon and toxic hustle.
- **Avoid on every slide:** em/en dashes, trailing periods on captions, numbered hype on the **first** slide ("5 things that…" as the hook—use that energy in **middle** slides if needed, not as the whisper hook).

**Emojis:** Prefer **none**. At most **one** emoji in the **entire** deck if it truly fits.

## Story rhythm
1. **Slide 1:** **Short** soft open—quiet curiosity to swipe.
2. **Middle slides (if any):** **Full** beats—one meaningful layer per slide; build the arc.
3. **Last slide:** **Short** quiet landing—warm close, tiny invitation, or soft sign-off.

**Timing:** First and last ~**1–2 seconds** to read; middle slides can be **3–6 seconds** of reading time.

## User topic
The user's message below is the **specific topic or angle**. Adapt `theme_title`, `theme_description`, and every **`caption`** to that topic while keeping **all lowercase**, **short bookends**, and **substantive middle** captions as above.

## Visual shot plan (mandatory, TikTok-native variety)
Strong slideshows **do not** repeat the same framing slide after slide. The **reference photos** may show the main subject, but your **shot_direction** must **rotate** distance, angle, and shot type: mix **main-subject beats** (tight, medium, three-quarter) with **B-roll** (related objects, environment, POV, textures, gear, drink, hands-only, ground-level, empty scene). **No two consecutive slides** should read as the **same composition recipe** (e.g. do not chain two generic "runner center frame same distance"). Think **same story world**, **clearly different frames**.

**Per slide you output two strings:**
- **caption:** on-screen text—**short** on slide 1 and last slide; **fuller** on middle slides when num_slides ≥ 3.
- **shot_direction:** instructions **only for the image generator** (not shown on screen). Be **concrete**: camera distance, angle, what's in frame, what's **out** of frame. Prefer **specific** labels where useful: waist-up, three-quarter, close-up on face, POV shoes, wide environment, prop on surface, etc.

**Running / training: force slice-of-life variety (not only mid-stride hero)**  
When the topic is **running, jogging, race prep, or training**, rotate **shot_direction** through **different real-life beats** like viral TikTok carousels: **running shoes on car floor mat or passenger seat**, **shoes + steering wheel or center console**, **Apple Watch or sports watch on wrist with workout UI glow** (describe timer vibe only, **no** readable text to paint), **phone in armband or hand** (screen not legible), **empty scenic road or trail**, **sunrise on path with no person**, **foam roller or massage ball**, **race bib on counter or laid flat**, **energy gels or earbuds on bench**, **water bottle in cup holder**, **socks and shoes by front door**, **gym bag POV**, **locker room bench detail**, **post-run drink on counter**, **track or starting-line texture**. Use **many** of these categories across the deck; **avoid** making most slides "runner centered jogging same framing".

**If the user message includes analyzed TikTok samples and/or precomputed vision notes for reference images**, **mirror how wide** their scene types go (in-car, wearable, landscape, macro, home/gym) when you write **your** original **shot_direction** lines, **without** copying their captions.

**Hard cap: full-body / head-to-toe main subject**
- Count slides whose **shot_direction** calls for **full-length / head-to-toe / entire body visible** framing of the main person (standing or running with **full body** in frame).
- **At most floor(num_slides / 3)** slides may be that kind of full-body hero. The **rest** of any person shots must be **tighter** (waist-up, chest-up, three-quarter, close-up, partial figure, environmental context with small figure, etc.).
- **Slide 1** still needs a **person** as focal point when the pipeline requires it, but **prefer waist-up, three-quarter, or medium** with face visible over head-to-toe full-body so you stay under the cap.

**B-roll minimums (slides that are not a full portrait of the main subject as sole focus):**
- **num_slides 1 to 3:** at least **one** slide must be B-roll or strong detail without the main person as the only subject.
- **num_slides 4+:** at least **half** (round up) must be B-roll / detail / POV / environment / prop, **not** repetitive hero portraits of the main person.

Hook and closer **can** be B-roll or tighter hero; meet **both** the B-roll minimums **and** the full-body cap.

## Caption punctuation (mandatory)
- **Never** use em dashes (Unicode U+2014) or en dashes (U+2013) in `theme_title`, `theme_description`, or any `caption`. Use commas or spare phrases instead.
- **Never** end any `caption` with a period (.). Do not end captions with sentence-ending punctuation that reads like a full stop (no trailing `.`).
- Apply the same dash rule to `theme_title` and `theme_description` when possible.
- **shot_direction** may use normal sentences; still avoid em/en dashes there.

Respond with ONLY valid JSON (no markdown) matching this shape:
{
  "num_slides": <integer from 1 to 12, how many images/captions this slideshow should use>,
  "theme_title": "<short line, all lowercase, soft minimal vibe>",
  "theme_description": "<1-2 short sentences, all lowercase, gentle mood for the series>",
  "slides": [
    {
      "caption": "<slide 1: short soft hook, all lowercase, ~3–10 words | middle: fuller value line(s), all lowercase, ~12–28 words / <= ~240 chars | last: short soft closer>",
      "shot_direction": "<1-3 short sentences: composition for the image model, e.g. POV shoes on road, no face>"
    }
  ]
}
Rules:
- **num_slides must equal slides.length** (same integer). If you miscount, the parser uses **slides.length** and ignores the wrong num_slides.
- **Every** slide object **must** include **shot_direction** (non-empty string).
- Choose num_slides from the topic: often **5 to 7** for a gentle series of beats; fewer if the arc is tiny.
- **slides[0].caption** = **short** soft hook. **slides[num_slides-1].caption** = **short** soft closer. **Middle captions** (when num_slides ≥ 3) = **substantive** one-idea-per-slide content, in order.
- Each caption is overlaid in post; **do not** assume words appear inside the photo. Line breaks not needed (we wrap in design).
"""

_INSPIRATION_SUPPLEMENT = """

## External reference sections (when present in the user message)
- **## Reference TikTok analyses:** use for **shot variety and pacing** (B-roll vs hero, in-car, wearables, scenery, macro props)—**not** for copying caption voice.
- **## Reference images (precomputed vision notes):** use as **factual descriptions** of reference stills available in `--input-dir`; align **shot_direction** with subjects, settings, and props you actually have. Still **original** captions for the user's topic.

In all cases: **`caption` / `theme_*` text** must stay **all lowercase** with **short first/last** and **fuller middle** slides. **Do not** copy sample on-screen wording from TikTok analyses. The **user's topic is primary**.
"""


def sanitize_overlay_text(s: str, *, lowercase: bool = False) -> str:
    """Enforce no em/en dashes and no trailing period (caption-style overlay)."""
    t = (s or "").strip()
    if not t:
        return t
    t = t.replace("\u2014", ", ").replace("\u2013", ", ")
    t = re.sub(r"\s*,\s*,+", ", ", t)
    t = t.rstrip()
    while t.endswith("."):
        t = t[:-1].rstrip()
    t = t.strip()
    if lowercase:
        t = t.lower()
    return t


def sanitize_shot_direction(s: str) -> str:
    """Normalize shot briefs: no em/en dashes; keep sentence punctuation."""
    t = (s or "").strip()
    if not t:
        return t
    t = t.replace("\u2014", ", ").replace("\u2013", ", ")
    t = re.sub(r"\s*,\s*,+", ", ", t)
    return t.strip()

# Exported for docs/tests; identical to the system message above.
TIKTOK_MOTIVATION_CORE_SYSTEM_PROMPT = _SYSTEM


_FIRST_SLIDE_PERSON_BLOCK = """
## First slide (mandatory for this pipeline)
slides[0].shot_direction must describe a frame where a **person** is the **clear main subject** (face visible or obvious human figure). **Prefer waist-up, three-quarter, or medium shot** with the person readable, **not** head-to-toe full-body unless you are sure the full-body budget (floor(n/3)) allows it. **Not** environment-only, **not** object-only B-roll, **not** disembodied feet/shoes/hands-only without the person visible. Slide 1 is still the hook; follow B-roll and full-body caps on the whole deck.
"""


def build_user_message(
    user_prompt: str,
    inspiration_context: str | None = None,
    *,
    first_slide_person_required: bool = False,
) -> str:
    """User turn: topic plus reminder of motivation-core framing; optional analyzed-TikTok block."""
    body = (
        "Topic / angle for this slideshow:\n"
        f"{user_prompt.strip()}\n\n"
        "Write the JSON plan. Rhythm: slide 1 = **short** soft hook, middle slides (if n≥3) = **fuller** real content "
        "one idea per slide (like classic TikTok value captions), last slide = **short** soft closer. "
        "**All `caption`, `theme_title`, and `theme_description` must be entirely lowercase**; bookends stay **minimal**, "
        "middle slides carry **substance**. "
        "For every slide include shot_direction: concrete image composition, mixing hero moments with "
        "B-roll (POV details, environment, props, crops) in the same story world as the topic. "
        "Meet the B-roll minimums and **full-body cap** (at most floor(n/3) head-to-toe full-length subject shots) from the system prompt. "
        "Vary shot types; avoid back-to-back identical framing. For running topics, rotate through props, "
        "in-car, watch/phone, scenic road, home/gym details, not only stride shots. "
        "Caption punctuation: no em dashes or en dashes, no period at the end of captions."
    )
    extra = (inspiration_context or "").strip()
    if extra:
        body += "\n\n" + extra
    if first_slide_person_required:
        body += "\n" + _FIRST_SLIDE_PERSON_BLOCK.strip()
    return body


def _parse_plan(raw: str) -> CaptionPlan:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    if "{" in raw and "}" in raw:
        raw = raw[raw.index("{") : raw.rindex("}") + 1]
    data: dict[str, Any] = json.loads(raw)
    slides_in = data.get("slides") or []
    if not slides_in:
        raise ValueError("slides array is empty")
    n = len(slides_in)
    declared = data.get("num_slides")
    if declared is not None:
        try:
            n_declared = int(declared)
        except (TypeError, ValueError):
            n_declared = n
        if n_declared != n:
            print(
                f"Warning: num_slides ({n_declared}) != len(slides) ({n}); "
                "using slides.length as the true count.",
                file=sys.stderr,
            )
    if n < 1 or n > 12:
        raise ValueError(f"slides must contain between 1 and 12 items, got {n}")
    slides: list[CaptionSlide] = []
    for s in slides_in:
        raw_shot = s.get("shot_direction") or s.get("shot_plan") or ""
        shot = sanitize_shot_direction(str(raw_shot))
        slides.append(
            CaptionSlide(
                caption=sanitize_overlay_text(str(s["caption"]), lowercase=True),
                shot_direction=shot,
            )
        )
    if any(not slide.shot_direction for slide in slides):
        raise ValueError("Every slide must include a non-empty shot_direction")
    return CaptionPlan(
        num_slides=n,
        theme_title=sanitize_overlay_text(str(data.get("theme_title", "")), lowercase=True),
        theme_description=sanitize_overlay_text(str(data.get("theme_description", "")), lowercase=True),
        slides=slides,
    )


def generate_caption_plan_openai(
    user_prompt: str,
    *,
    model: str | None = None,
    inspiration_context: str | None = None,
    first_slide_person_required: bool = False,
) -> CaptionPlan:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("Install openai: pip install openai") from e

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (see test_scripts/.env.example).")

    m = (model or os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")).strip()
    client = OpenAI(api_key=api_key)
    system = _SYSTEM
    if (inspiration_context or "").strip():
        system = _SYSTEM + _INSPIRATION_SUPPLEMENT
    resp = client.chat.completions.create(
        model=m,
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": build_user_message(
                    user_prompt,
                    inspiration_context,
                    first_slide_person_required=first_slide_person_required,
                ),
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.7,
    )
    content = resp.choices[0].message.content
    if not content:
        raise RuntimeError("OpenAI returned empty content")
    return _parse_plan(content)


def generate_caption_plan_gemini(
    user_prompt: str,
    *,
    model: str | None = None,
    inspiration_context: str | None = None,
    first_slide_person_required: bool = False,
) -> CaptionPlan:
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError("Install google-genai") from e

    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set.")

    m = (model or os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.0-flash")).strip()
    client = genai.Client(api_key=api_key)
    system = _SYSTEM
    if (inspiration_context or "").strip():
        system = _SYSTEM + _INSPIRATION_SUPPLEMENT
    full_prompt = system + "\n\n" + build_user_message(
        user_prompt,
        inspiration_context,
        first_slide_person_required=first_slide_person_required,
    )
    response = client.models.generate_content(model=m, contents=full_prompt)
    text = getattr(response, "text", None) or ""
    if not text.strip():
        parts = []
        for cand in getattr(response, "candidates", None) or []:
            content = getattr(cand, "content", None)
            for p in getattr(content, "parts", None) or []:
                t = getattr(p, "text", None)
                if t:
                    parts.append(t)
        text = "\n".join(parts)
    if not text.strip():
        raise RuntimeError("Gemini returned empty text")
    return _parse_plan(text)


__all__ = [
    "CaptionSlide",
    "CaptionPlan",
    "TIKTOK_MOTIVATION_CORE_SYSTEM_PROMPT",
    "build_user_message",
    "sanitize_overlay_text",
    "sanitize_shot_direction",
    "generate_caption_plan_openai",
    "generate_caption_plan_gemini",
]
