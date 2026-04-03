"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
    >
      <TooltipProvider delay={300}>
        {children}
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
