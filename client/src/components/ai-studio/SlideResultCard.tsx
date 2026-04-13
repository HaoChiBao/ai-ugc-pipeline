"use client";

import type { GeneratedProjectResultForClient } from "@/lib/generation/assembleClientResult";

type Slide = GeneratedProjectResultForClient["slides"][number];

export function SlideResultCard({ slide }: { slide: Slide }) {
  return (
    <article className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
          #{slide.order}
        </span>
        <span className="text-xs text-muted-foreground">{slide.purpose}</span>
        <span className="text-xs text-muted-foreground">{slide.visualType}</span>
      </div>
      <h3 className="font-semibold leading-tight">{slide.headline}</h3>
      {slide.body ? (
        <p className="text-xs text-muted-foreground">{slide.body}</p>
      ) : null}
      {slide.microcopy ? (
        <p className="text-xs italic text-muted-foreground">{slide.microcopy}</p>
      ) : null}
      {slide.visualPrompt ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Visual: </span>
          {slide.visualPrompt}
        </p>
      ) : null}
      {slide.referenceUsageNotes?.length ? (
        <ul className="list-inside list-disc text-[10px] text-muted-foreground">
          {slide.referenceUsageNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
      {slide.signedImageUrl ? (
        <div className="overflow-hidden rounded-md border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.signedImageUrl}
            alt=""
            className="max-h-40 w-full object-cover"
          />
        </div>
      ) : null}
    </article>
  );
}
