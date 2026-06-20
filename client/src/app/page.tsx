import { CanvasWorkspaceProvider } from "@/components/canvas/CanvasWorkspaceContext";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";

export default function Home() {
  return (
    <CanvasWorkspaceProvider>
      <div className="flex h-svh min-h-0 flex-col bg-muted/30">
        <InfiniteCanvas />
      </div>
    </CanvasWorkspaceProvider>
  );
}
