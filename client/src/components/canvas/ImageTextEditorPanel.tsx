"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { resolveCanvasImageObjectFit } from "@/lib/canvas/canvasImageObjectFit";
import { captionTypographyStyle } from "@/lib/canvas/captionOverlay";
import {
  DEFAULT_CAPTION_FONT_PX,
  type CanvasItem,
  type CanvasItemPatch,
  type ImageCanvasItem,
  type PinterestCanvasItem,
  type TextAlignOption,
  type TextCanvasItem,
} from "@/lib/canvas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "Sans",
    value:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  {
    label: "Mono",
    value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  { label: "Display", value: '"Impact", "Arial Black", sans-serif' },
];

const clampFrac = (v: number) => Math.min(0.92, Math.max(0.08, v));

export type CanvasTextEditSubject =
  | { kind: "image"; item: ImageCanvasItem }
  | { kind: "pinterest"; item: PinterestCanvasItem };

type ImageTextEditorPanelProps = {
  subject: CanvasTextEditSubject;
  items: CanvasItem[];
  onClose: () => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
  onAddItem: (item: CanvasItem) => void;
  onRemoveItem: (id: string) => void;
  /** Match canvas: Pinterest uses cover only when Similar is available. */
  pinterestSimilarEnabled?: boolean;
};

function captionsForSubject(
  items: CanvasItem[],
  subject: CanvasTextEditSubject,
): TextCanvasItem[] {
  if (subject.kind === "image") {
    return items.filter(
      (i): i is TextCanvasItem =>
        i.type === "text" && i.attachedToImageId === subject.item.id,
    );
  }
  return items.filter(
    (i): i is TextCanvasItem =>
      i.type === "text" &&
      i.attachedToPinterestItemId === subject.item.id,
  );
}

export function ImageTextEditorPanel({
  subject,
  items,
  onClose,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  pinterestSimilarEnabled = true,
}: ImageTextEditorPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 640, h: 400 });

  const captions = captionsForSubject(items, subject);
  const selected = captions.find((c) => c.id === selectedId) ?? null;
  const fontSelectValue =
    selected?.fontFamily ?? FONT_PRESETS[0]!.value;
  const fontIsCustom = Boolean(
    selected?.fontFamily &&
      !FONT_PRESETS.some((p) => p.value === selected.fontFamily),
  );

  useLayoutEffect(() => {
    const measure = () => {
      const maxW = Math.min(window.innerWidth * 0.94, 1500);
      const maxH = window.innerHeight * 0.86;
      const iw = subject.item.width;
      const ih = subject.item.height;
      const s = Math.min(maxW / iw, maxH / ih, 1.4);
      setBox({ w: iw * s, h: ih * s });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [subject.item.width, subject.item.height]);

  const scale = box.w / subject.item.width;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addCaption = useCallback(() => {
    const iw = subject.item.width;
    const w = Math.min(iw - 12, 280);
    const base: TextCanvasItem = {
      id: crypto.randomUUID(),
      type: "text",
      x: 0,
      y: 0,
      width: w,
      height: 100,
      text: "New caption",
      fontSize: DEFAULT_CAPTION_FONT_PX,
      fontWeight: 700,
      textAlign: "center",
      overlayFractionX: 0.5,
      overlayFractionY: 0.45,
    };
    const t: TextCanvasItem =
      subject.kind === "image"
        ? { ...base, attachedToImageId: subject.item.id }
        : { ...base, attachedToPinterestItemId: subject.item.id };
    onAddItem(t);
    setSelectedId(t.id);
  }, [onAddItem, subject]);

  const title =
    subject.kind === "pinterest" ? "Edit text on pin" : "Edit text on image";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/45 p-3 backdrop-blur-xl backdrop-saturate-150"
      role="dialog"
      aria-modal
      aria-labelledby="image-text-editor-title"
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-[min(96rem,100%)] flex-1 flex-col gap-3 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-white">
            <Pencil className="size-5 opacity-90" aria-hidden />
            <h2 id="image-text-editor-title" className="text-lg font-semibold">
              {title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={addCaption}
            >
              <Plus className="size-4" />
              Add caption
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-1">
            <div
              className="relative shrink-0 rounded-xl border border-black/10 bg-muted shadow-[0_25px_60px_-12px_rgba(0,0,0,0.45),0_12px_24px_-8px_rgba(0,0,0,0.25)] ring-1 ring-black/5"
              style={{ width: box.w, height: box.h }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {subject.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={subject.item.src}
                  alt=""
                  className={cn(
                    "pointer-events-none absolute inset-0 h-full w-full rounded-xl",
                    resolveCanvasImageObjectFit(
                      subject.item,
                      pinterestSimilarEnabled,
                    ) === "cover"
                      ? "object-cover"
                      : "object-contain",
                  )}
                  draggable={false}
                />
              ) : subject.item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={subject.item.thumbnailUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full rounded-xl object-cover"
                  draggable={false}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                  No thumbnail
                </div>
              )}
              {captions.map((t) => (
                <EditorCaptionLayer
                  key={t.id}
                  text={t}
                  boxW={box.w}
                  boxH={box.h}
                  scale={scale}
                  selected={t.id === selectedId}
                  onSelect={() => setSelectedId(t.id)}
                  onUpdate={(patch) => onUpdateItem(t.id, patch)}
                />
              ))}
            </div>
          </div>

          <aside className="flex max-h-[min(86vh,100%)] w-full shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border/80 bg-white p-4 text-foreground shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25),0_10px_20px_-8px_rgba(0,0,0,0.12)] md:w-[22rem]">
            {selected ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cap-text" className="text-muted-foreground">
                    Text
                  </Label>
                  <textarea
                    id="cap-text"
                    className="min-h-[100px] max-h-[min(42vh,22rem)] w-full resize-y overflow-y-auto rounded-md border border-input bg-background px-2 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    value={selected.text}
                    onChange={(e) =>
                      onUpdateItem(selected.id, { text: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground">Font size</Label>
                    <Input
                      type="number"
                      min={8}
                      max={120}
                      value={selected.fontSize ?? DEFAULT_CAPTION_FONT_PX}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        onUpdateItem(selected.id, {
                          fontSize: Math.min(120, Math.max(8, n)),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground">Weight</Label>
                    <Input
                      type="number"
                      min={100}
                      max={900}
                      step={100}
                      value={selected.fontWeight ?? 700}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        onUpdateItem(selected.id, {
                          fontWeight: Math.min(900, Math.max(100, n)),
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Font</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={fontSelectValue}
                    onChange={(e) =>
                      onUpdateItem(selected.id, { fontFamily: e.target.value })
                    }
                  >
                    {fontIsCustom ? (
                      <option
                        value={selected.fontFamily}
                      >
                        Current font
                      </option>
                    ) : null}
                    {FONT_PRESETS.map((p) => (
                      <option key={p.label} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground">Color</Label>
                    <Input
                      type="color"
                      className="h-9 w-14 cursor-pointer border border-input bg-background p-1"
                      value={selected.color ?? "#ffffff"}
                      onChange={(e) =>
                        onUpdateItem(selected.id, { color: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-muted-foreground">Align</Label>
                    <div className="flex gap-1">
                      {(
                        [
                          ["left", AlignLeft],
                          ["center", AlignCenter],
                          ["right", AlignRight],
                        ] as const
                      ).map(([al, Icon]) => (
                        <Button
                          key={al}
                          type="button"
                          size="icon"
                          variant={
                            (selected.textAlign ?? "center") === al
                              ? "default"
                              : "secondary"
                          }
                          className="size-9"
                          onClick={() =>
                            onUpdateItem(selected.id, {
                              textAlign: al as TextAlignOption,
                            })
                          }
                          aria-label={`Align ${al}`}
                        >
                          <Icon className="size-4" />
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mt-auto gap-1.5"
                  onClick={() => {
                    onRemoveItem(selected.id);
                    setSelectedId(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Remove caption
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a caption, or add one. Drag the frame (not the text) to
                move; drag the corner handle to resize.
              </p>
            )}
          </aside>
        </div>

        <p className="shrink-0 text-center text-[11px] text-white/55">
          Escape to close · Changes apply to the canvas (undo with ⌘/Ctrl+Z)
        </p>
      </div>
    </div>
  );
}

type EditorCaptionLayerProps = {
  text: TextCanvasItem;
  boxW: number;
  boxH: number;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: CanvasItemPatch) => void;
};

function EditorCaptionLayer({
  text,
  boxW,
  boxH,
  scale,
  selected,
  onSelect,
  onUpdate,
}: EditorCaptionLayerProps) {
  const dragRef = useRef<{
    startClient: { x: number; y: number };
    startFx: number;
    startFy: number;
  } | null>(null);

  const resizeRef = useRef<{
    startClient: { x: number; y: number };
    startW: number;
    startH: number;
  } | null>(null);

  const fx = text.overlayFractionX ?? 0.5;
  const fy = text.overlayFractionY ?? 0.42;
  const dispW = text.width * scale;
  const dispH = text.height * scale;
  const leftPct = fx * 100;
  const topPct = fy * 100;

  const fontFamily =
    text.fontFamily ??
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fontWeight = text.fontWeight ?? 700;
  const fontPx = (text.fontSize ?? DEFAULT_CAPTION_FONT_PX) * scale;
  const color = text.color ?? "#ffffff";
  const align = text.textAlign ?? "center";

  const frameDragTarget = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    return !t.closest("textarea");
  };

  const onDragHandleDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!frameDragTarget(e)) return;
    e.stopPropagation();
    onSelect();
    dragRef.current = {
      startClient: { x: e.clientX, y: e.clientY },
      startFx: fx,
      startFy: fy,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClient.x;
    const dy = e.clientY - d.startClient.y;
    const nfx = clampFrac(d.startFx + dx / boxW);
    const nfy = clampFrac(d.startFy + dy / boxH);
    onUpdate({ overlayFractionX: nfx, overlayFractionY: nfy });
  };

  const onDragUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onResizeDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    resizeRef.current = {
      startClient: { x: e.clientX, y: e.clientY },
      startW: text.width,
      startH: text.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = (e.clientX - r.startClient.x) / scale;
    const dy = (e.clientY - r.startClient.y) / scale;
    onUpdate({
      width: Math.max(80, r.startW + dx),
      height: Math.max(40, r.startH + dy),
    });
  };

  const onResizeUp = (e: React.PointerEvent) => {
    resizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="absolute overflow-visible"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: dispW,
        height: dispH,
        transform: "translate(-50%, -50%)",
        zIndex: selected ? 20 : 10,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        className={cn(
          "relative box-border h-full w-full touch-none rounded-md border-2 border-transparent bg-black/45 p-2 shadow-md transition-[border-color,box-shadow] duration-150",
          selected
            ? "cursor-grab border-primary ring-2 ring-primary/35 active:cursor-grabbing"
            : "cursor-grab active:cursor-grabbing hover:border-primary/85 hover:ring-2 hover:ring-primary/25",
        )}
        onPointerDown={onDragHandleDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
      >
        <textarea
          className={cn(
            "h-full min-h-0 w-full cursor-text resize-none overflow-y-auto border-0 bg-transparent p-0 outline-none",
            "text-white placeholder:text-white/40",
            align === "center" && "text-center",
            align === "right" && "text-right",
          )}
          style={captionTypographyStyle({
            fontSizePx: fontPx,
            fontFamily,
            fontWeight,
            color,
          })}
          value={text.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          spellCheck
        />
        {selected ? (
          <div
            role="presentation"
            className="absolute -bottom-2 -right-2 z-30 size-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-background shadow-md"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
          />
        ) : null}
      </div>
    </div>
  );
}
