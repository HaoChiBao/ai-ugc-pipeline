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

type PinterestUrlDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitUrl: (url: string) => void;
};

export function PinterestUrlDialog({
  open,
  onOpenChange,
  onSubmitUrl,
}: PinterestUrlDialogProps) {
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
          <DialogTitle>Add Pinterest pin</DialogTitle>
          <DialogDescription>
            Paste a pin link (pinterest.com/pin/… or pin.it/…). Preview loads via
            Pinterest oEmbed; similar pins use the local test_scripts API.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-1">
          <Label htmlFor="pinterest-url-input">Pin URL</Label>
          <Input
            id="pinterest-url-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://www.pinterest.com/pin/…"
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
