"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type SlideRow = { index: number; path: string; url: string };

type GenerateResponse = {
  session_id: string;
  base_url?: string;
  slides: SlideRow[];
};

/**
 * Calls the FastAPI slide-gen-service (Gemini, disk folders) via POST /api/slide-gen.
 * Images load from the Python server (see NEXT_PUBLIC_SLIDE_GEN_SERVICE_URL).
 */
export function PythonSlidesPanel() {
  const id = useId();
  const [prompt, setPrompt] = useState("");
  const [numSlides, setNumSlides] = useState(4);
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const publicBase =
    process.env.NEXT_PUBLIC_SLIDE_GEN_SERVICE_URL?.trim() || "";

  const imageSrc = (s: SlideRow) => {
    if (publicBase) {
      return `${publicBase.replace(/\/$/, "")}${s.path}`;
    }
    return s.url;
  };

  const onSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt.");
      return;
    }
    const fd = new FormData();
    fd.append("prompt", prompt.trim());
    fd.append("num_slides", String(numSlides));
    if (files?.length) {
      for (const f of Array.from(files)) {
        fd.append("images", f);
      }
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/slide-gen", { method: "POST", body: fd });
      const data = (await res.json()) as GenerateResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setResult(data);
      toast.success("Slides generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <div>
        <h3 className="text-sm font-medium">Python slide images (Gemini)</h3>
        <p className="text-xs text-muted-foreground">
          No app database — uploads and PNGs are stored under the Python service{" "}
          <code className="rounded bg-muted px-1">data/</code> folder. Run{" "}
          <code className="rounded bg-muted px-1">uvicorn main:app --reload --port 8000</code>{" "}
          in <code className="rounded bg-muted px-1">slide-gen-service/</code>.
        </p>
      </div>

      <label className="block text-xs font-medium" htmlFor={`${id}-prompt`}>
        Prompt
      </label>
      <textarea
        id={`${id}-prompt`}
        className="min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the slideshow (style, subject, mood)…"
        disabled={loading}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Slides</span>
          <input
            type="number"
            min={1}
            max={12}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={numSlides}
            onChange={(e) => setNumSlides(Number(e.target.value) || 1)}
            disabled={loading}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <span className="text-muted-foreground">References</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="max-w-[200px] text-[11px]"
            onChange={(e) => setFiles(e.target.files)}
            disabled={loading}
          />
        </label>
      </div>

      <Button
        type="button"
        className="w-full"
        variant="secondary"
        disabled={loading}
        onClick={() => void onSubmit()}
      >
        {loading ? "Generating…" : "Generate slide images (Python)"}
      </Button>

      {result ? (
        <>
          <Separator />
          <p className="text-[11px] text-muted-foreground">
            Session{" "}
            <code className="rounded bg-muted px-1">{result.session_id}</code>
          </p>
          <div className="grid max-h-[min(50vh,360px)] grid-cols-2 gap-2 overflow-y-auto">
            {result.slides.map((s) => (
              <figure
                key={s.index}
                className="overflow-hidden rounded-md border bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc(s)}
                  alt={`Slide ${s.index}`}
                  className="aspect-[9/16] w-full object-cover"
                />
                <figcaption className="border-t px-1 py-0.5 text-center text-[10px] text-muted-foreground">
                  #{s.index}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
