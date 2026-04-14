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

type PinterestSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitSearch: (query: string) => void;
};

export function PinterestSearchDialog({
  open,
  onOpenChange,
  onSubmitSearch,
}: PinterestSearchDialogProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSubmitSearch(v);
  }, [onSubmitSearch, value]);

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
          <DialogTitle>Search Pinterest pins</DialogTitle>
          <DialogDescription>
            Runs a Pinterest search via the local test_scripts API (gallery-dl).
            Matching images are placed in a new group on the canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-1">
          <Label htmlFor="pinterest-search-input">Search query</Label>
          <Input
            id="pinterest-search-input"
            type="search"
            autoComplete="off"
            placeholder="e.g. minimalist kitchen moodboard"
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
            Add results to canvas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
