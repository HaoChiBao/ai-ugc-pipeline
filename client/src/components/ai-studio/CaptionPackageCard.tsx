"use client";

import { Button } from "@/components/ui/button";
import type { GeneratedProjectResult } from "@/lib/generation/types";
import { toast } from "sonner";

type CaptionPackageCardProps = {
  pkg: GeneratedProjectResult["captionPackage"];
};

export function CaptionPackageCard({ pkg }: CaptionPackageCardProps) {
  const text = [pkg.caption, pkg.cta ? `\n\n${pkg.cta}` : ""]
    .filter(Boolean)
    .join("");
  const tags = pkg.hashtags.length
    ? `\n\n${pkg.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}`
    : "";

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text + tags);
      toast.success("Caption copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Caption package</h3>
        <Button type="button" variant="outline" size="sm" onClick={copyAll}>
          Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed">{pkg.caption}</p>
      {pkg.cta ? <p className="text-xs font-medium">{pkg.cta}</p> : null}
      {pkg.hashtags.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {pkg.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}
        </p>
      ) : null}
    </div>
  );
}
