"use client";

type GenerationProgressProps = {
  status: string | null;
  progress: number;
  error: string | null;
};

export function GenerationProgress({
  status,
  progress,
  error,
}: GenerationProgressProps) {
  if (!status && !error) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <>
          <div className="flex justify-between gap-2">
            <span className="font-medium capitalize">{status}</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
