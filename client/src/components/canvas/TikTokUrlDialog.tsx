"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TikTokUrlDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitUrl: (url: string) => void;
};

export function TikTokUrlDialog({
  open,
  onOpenChange,
  onSubmitUrl,
}: TikTokUrlDialogProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSubmitUrl(v);
  }, [onSubmitUrl, value]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setValue("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Add TikTok URL</DialogTitle>
          <DialogDescription>
            Paste a TikTok video or short link. Only tiktok.com links are
            accepted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-1">
          <Label htmlFor="tiktok-url-input">TikTok URL</Label>
          <Input
            id="tiktok-url-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://www.tiktok.com/@…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            Add to canvas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
