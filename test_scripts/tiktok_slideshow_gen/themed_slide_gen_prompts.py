"""Gemini prompts: OpenAI caption plan + user topic + per-slide caption + reference-grounded rules."""

from __future__ import annotations

from .caption_plan_llm import CaptionPlan


def _slide_role_for_gemini(
    slide_index: int,
    total_slides: int,
    *,
    first_slide_must_show_person: bool = True,
) -> str:
    """Map carousel formula roles to image-generation hints (Hook / Value / Closer)."""
    if total_slides < 1:
        return ""
    if total_slides == 1:
        person = ""
        if first_slide_must_show_person:
            person = (
                "- **Mandatory:** A **person** is the **primary focal point**. Match identity from the "
                "**first subject-reference images**.\n"
            )
        return (
            "## Carousel role (single slide)\n"
            + person
            + "- **Hook and payoff in one frame:** bold, readable, scroll-stopping composition.\n\n"
        )
    if slide_index == 1:
        person = ""
        if first_slide_must_show_person:
            person = (
                "- **Mandatory:** Slide 1 must show a **person** as the **primary focal point** (face visible "
                "or clear human presence). **Prefer waist-up, three-quarter, or medium** over head-to-toe full-body. "
                "Match **identity from the first subject-reference images** (not from example-carousel frames). "
                "**Not** environment-only, not object-only, not hands/feet only.\n"
            )
        return (
            "## Carousel role (slide 1 = HOOK)\n"
            + person
            + "- **First slide wins or loses the swipe.** Visual should feel **immediate and bold**: clear "
            "subject, strong emotion or curiosity, **not** a cluttered infographic. Match the **open loop** "
            "energy of the hook caption (viewer should need slide 2).\n\n"
        )
    if slide_index == total_slides:
        return (
            "## Carousel role (last slide = CLOSER)\n"
            "- **Land the arc:** warm, grounded, or **inviting** (payoff or soft follow/save energy). Avoid "
            "generic stock poses. This should feel like a **satisfying end** to the story started on slide 1.\n\n"
        )
    return (
        "## Carousel role (middle = VALUE)\n"
        "- **One beat per slide:** a single clear moment that matches **this slide's caption only**. Build "
        "the story step by step; **do not** repeat the same composition as slide 1.\n\n"
    )


def _themed_slide_image_master_block(
    *,
    num_subject_reference_images: int,
    num_example_carousel_images: int = 0,
    example_anchor_light_edit: bool = False,
) -> str:
    k = max(1, num_subject_reference_images)
    m = max(0, num_example_carousel_images)
    subj = "reference image" if k == 1 else f"{k} reference images"
    order = (
        "## Multimodal reference order (images after this text)\n"
        f"- **Images 1–{k}** (**subject / world**): who to match (body, hair, wardrobe), environment type, "
        "lighting. These define **identity** for any slide that shows the main person.\n"
    )
    if m > 0:
        hi = k + m
        if m == 1 and example_anchor_light_edit:
            order += (
                f"- **Image {k + 1}** (**matched TikTok carousel still** for **this slide only**): closest real "
                "sample to the **Planned shot** beat. Use it as the **primary layout and prop reference** for "
                f"this frame. **Re-photograph** the same **kind** of scene as a **new** iPhone picture: keep "
                f"camera distance and scenario similar. **Anyone visible** must match **images 1–{k}**, not the "
                "sample creator. Apply **only small** changes vs the sample (e.g. **hair color or style**, "
                "**shoe or shorts color**, **top hue**, minor background prop) so it is **not** a pixel copy. "
                "**Strip** captions, logos, and readable UI; never paint overlay text.\n"
            )
        else:
            order += (
                f"- **Images {k + 1}–{hi}** (**example TikTok carousel frames**): real slideshow stills for "
                f"**composition, pacing, and shot variety** only. **Do not** copy any visible text from them. "
                f"**Do not** paste them as a collage. **Identity** still comes from images 1–{k}.\n"
            )
    order += (
        "- **Do NOT** stitch all references into one composite. **Do NOT** output a grid.\n\n"
        "## References = one visual world (not the same framing every slide)\n"
        f"The **{subj}** (first group) anchor **world**: when the **main subject** appears they should "
        "**match** that person. The deck mixes **hero moments** with **B-roll**; follow **Planned shot** "
        "even when that means **no person**, **only hands/feet**, **empty environment**, or a **related object** "
        "(except **slide 1** always follows the carousel-role person rule above).\n"
        f"- When **Planned shot** asks for the main subject: preserve identity from **images 1–{k}**; "
        "**small edits only** on faces (subtle), clothing swaps, pose, distance. When it asks for B-roll: "
        "**do not** force a full portrait; stay in the **same place and time** as the subject refs when possible.\n"
        "- **Consistency across slides:** one muted color grade, grain level, and lighting family so the "
        "carousel feels like **one shoot**, not mixed stock packs.\n\n"
        "## B-roll and detail (slides after 1)\n"
        "- Treat **POV**, **ground level**, **macro on gear**, **prop on surface**, **hands only**, "
        "**environment with no people**, and **motion-blur fragments** as first-class shots when the plan "
        "calls for them.\n"
        "- For **running / training**: shoes in car, watch on wrist, scenic empty road, gear on bench, "
        "bottle in cup holder, socks by door, track texture, etc., as in **Planned shot**.\n\n"
        "## Look: iPhone-style capture (every frame)\n"
        "- **Device read:** Should look like a **real photo from a recent iPhone** (main rear camera, handheld): "
        "natural Smart HDR level, **not** DSLR, **not** studio, **not** synthetic CGI.\n"
        "- **Saturation:** **Clearly desaturated** vs stock ads or viral filters: natural skin, slightly duller "
        "greens and skies, **no** neon punch or oversaturated FYP grading.\n"
        "- **Background blur:** **Light** depth only: mild real-lens falloff. **Do not** use heavy portrait-mode "
        "blur, strong bokeh cream, or aggressive background obliteration. Most of the scene should stay "
        "**recognizable**, not smeared.\n"
        "- **Noise / grain:** **Visible ISO noise** in shadows and midtones (authentic phone sensor), like "
        "indoor or mixed light; **not** perfectly clean, noise-free render skin.\n"
        "- Natural JPEG, believable dynamic range, handheld micro-tilt OK. Avoid plastic skin, HDR halos, "
        "waxy faces, extra fingers.\n"
        "- Prefer vertical **9:16** unless references clearly imply otherwise.\n"
        "- **No** captions, logos, watermarks, or readable text painted into the photo.\n\n"
        "## This slide vs the rest\n"
        "- This frame must match **Planned shot** and feel distinct from other slides.\n"
        "- **Pacing:** Middle slides rotate B-roll and subject beats; closer per the plan.\n"
    )
    return order


def _matched_sample_analysis_hint_block(scene_hint: str) -> str:
    h = (scene_hint or "").strip().replace("\n", " ")
    if len(h) > 420:
        h = h[:419].rstrip() + "…"
    if not h:
        return ""
    return (
        "## Matched sample (analysis summary only)\n"
        f"The chosen reference still was described in analysis as: {h}\n"
        "Use this only to align **scene type**; output must still be a **new** photo with the constraints above.\n\n"
    )


def _iphone_frame_subprompt() -> str:
    """Repeated on every slide so the image model always sees device + grade constraints."""
    return (
        "## iPhone capture (apply to this frame)\n"
        "- Output must look like it was taken on an **iPhone** in everyday use: rear camera, handheld, "
        "natural processing.\n"
        "- **Lower saturation** than glossy stock or influencer filters; keep colors believable and slightly muted.\n"
        "- **Background:** keep blur **subtle** (gentle depth), **not** strong portrait blur or fake bokeh soup.\n"
        "- **Noise:** include **fine sensor grain / ISO noise** in darker areas, not a perfectly smooth render.\n"
    )


def build_themed_slide_gemini_prompt(
    plan: CaptionPlan,
    user_topic: str,
    slide_index: int,
    total_slides: int,
    *,
    num_subject_reference_images: int = 7,
    num_example_carousel_images: int = 0,
    inspiration_append: str | None = None,
    first_slide_must_show_person: bool = True,
    example_anchor_light_edit: bool = False,
    matched_scene_hint: str | None = None,
) -> str:
    """
    Full text prompt for one generated image.

    Reference images are passed as separate multimodal parts; this string
    carries theme, series mood, slide caption (scene direction only — no text in-image),
    and reference-grounded + phone-camera rules.
    """
    if slide_index < 1 or slide_index > total_slides:
        raise ValueError("slide_index out of range")
    slide = plan.slides[slide_index - 1]
    cap = slide.caption.strip()
    shot = slide.shot_direction.strip() or (
        "Single clear moment in the same world as the references; vary distance and angle. "
        "Include environment or detail when it fits the caption, not only a centered hero portrait."
    )
    topic = user_topic.strip()
    extra = (inspiration_append or "").strip()
    hint = (matched_scene_hint or "").strip()
    matched_blk = _matched_sample_analysis_hint_block(hint) if example_anchor_light_edit and hint else ""
    tail = (
        f"{_slide_role_for_gemini(slide_index, total_slides, first_slide_must_show_person=first_slide_must_show_person)}"
        f"{_themed_slide_image_master_block(num_subject_reference_images=num_subject_reference_images, num_example_carousel_images=num_example_carousel_images, example_anchor_light_edit=example_anchor_light_edit)}"
        f"{matched_blk}"
        f"{_iphone_frame_subprompt()}"
    )
    if extra:
        tail = f"{tail}\n{extra}\n"
    return (
        f"## User topic\n{topic}\n\n"
        f"## Series title\n{plan.theme_title}\n\n"
        f"## Series mood\n{plan.theme_description}\n\n"
        f"## Slide {slide_index} of {total_slides}\n"
        "### Planned shot (follow this composition strictly)\n"
        f"{shot}\n\n"
        "**On-screen caption** (we add this in post; **do not render this text inside the photo**; "
        "use it only to guide mood and story):\n"
        f"{cap}\n\n"
        "Compose with space for later text overlay if possible, but **do not** paint caption words into pixels.\n\n"
        f"{tail}"
    )


def _remaster_reference_order_block(num_identity_refs: int) -> str:
    k = max(0, num_identity_refs)
    if k == 0:
        return (
            "## Image order (after this text)\n"
            "- **Image 1** is the **source TikTok still** to **remaster**. Treat it as the photograph you are "
            "**editing**, not a loose style reference.\n\n"
        )
    subj = "reference image" if k == 1 else f"{k} reference images"
    return (
        "## Image order (after this text)\n"
        "- **Image 1** is the **source TikTok still** to **remaster**. Keep its **composition, camera distance, "
        "and setting** as the backbone; apply **only** the tweaks described below.\n"
        f"- **Images 2–{k + 1}** are **subject identity** ({subj}): when a **person** appears, match **face, hair, "
        "and body type** from these. **Do not** copy their pose or outfit if it fights the source frame—blend "
        "naturally, **no** pasted-face look.\n\n"
    )


def build_remaster_slide_gemini_prompt(
    plan: CaptionPlan,
    user_topic: str,
    slide_index: int,
    total_slides: int,
    *,
    source_summary: str,
    num_identity_refs: int = 0,
    inspiration_append: str | None = None,
    first_slide_must_show_person: bool = True,
) -> str:
    """
    Prompt for **editing one attached source photo** (first image after text) plus optional identity refs.

    Intended for ``generate_remastered_slides_from_bases`` (text + base + identity stack).
    """
    if slide_index < 1 or slide_index > total_slides:
        raise ValueError("slide_index out of range")
    slide = plan.slides[slide_index - 1]
    cap = slide.caption.strip()
    shot = slide.shot_direction.strip() or (
        "Subtle tweaks only: align mood and small details with the caption; keep the source layout."
    )
    topic = user_topic.strip()
    src = (source_summary or "").strip().replace("\n", " ")
    if len(src) > 520:
        src = src[:519].rstrip() + "…"
    extra = (inspiration_append or "").strip()

    remaster_core = (
        "## Task: Remaster this photo (not a new scene)\n"
        "**Do not** invent a brand-new location, pose, or camera angle from scratch. Output should read as the "
        "**same candid phone shot**, lightly adjusted.\n\n"
        "**Goals (in order):**\n"
        "1. **Preserve** the source image's **layout**, focal subject placement, and **real** environment.\n"
        "2. **Tweak** to fit **Planned shot**: lighting mood, minor wardrobe/prop color shifts, small background "
        "cleanup—**subtle**, believable.\n"
        "3. **Remove** TikTok **on-image text, logos, watermarks, and readable UI** from the source. "
        "**Never** paint the overlay caption words into pixels.\n"
        "4. **iPhone realism:** slightly **desaturated**, **visible ISO noise**, **light** background blur only, "
        "handheld energy. **Not** CGI, **not** heavy beauty filter, **not** stock polish.\n"
        "5. This slide must feel **distinct** from other slides in the deck (different beat than slide 1); "
        "still **one coherent series** (same world / subject when the plan calls for a person).\n\n"
    )
    source_ctx = (
        f"## Source frame (analysis summary)\n{src}\n\n" if src else "## Source frame (analysis summary)\n(none)\n\n"
    )
    tail = (
        f"{_remaster_reference_order_block(num_identity_refs)}"
        f"{_slide_role_for_gemini(slide_index, total_slides, first_slide_must_show_person=first_slide_must_show_person)}"
        f"{_iphone_frame_subprompt()}"
    )
    if extra:
        tail = f"{tail}\n## Inspiration context (posts)\n{extra}\n"

    return (
        f"{remaster_core}"
        f"{source_ctx}"
        f"## User topic\n{topic}\n\n"
        f"## Series title\n{plan.theme_title}\n\n"
        f"## Series mood\n{plan.theme_description}\n\n"
        f"## Slide {slide_index} of {total_slides}\n"
        "### Planned shot (guide tweaks; keep source composition)\n"
        f"{shot}\n\n"
        "**On-screen caption** (we add in post; **do not render** inside the photo):\n"
        f"{cap}\n\n"
        f"{tail}"
    )
