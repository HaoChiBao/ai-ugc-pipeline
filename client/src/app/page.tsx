import { AIStudioPanel } from "@/components/ai-studio/AIStudioPanel";
import { CanvasWorkspaceProvider } from "@/components/canvas/CanvasWorkspaceContext";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";

export default function Home() {
  return (
    <CanvasWorkspaceProvider>
      <div className="flex h-svh min-h-0 flex-row bg-muted/30">
        {/* Explicit height + flex column so InfiniteCanvas flex-1 children get a definite main size */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <InfiniteCanvas />
        </div>
        <AIStudioPanel />
      </div>
    </CanvasWorkspaceProvider>
  );
}
