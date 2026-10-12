import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler";
import { LiveUpdateCheck } from "@/components/live-update-check";
import { SiteFooter } from "@/components/layout/site-footer";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "NexusAI Roleplay",
  description: "AI-powered roleplay chatbot platform",
  icons: {
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "NexusAI Roleplay",
    description: "AI-powered roleplay chatbot platform",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Audiowide&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,700;1,6..96,400&family=Caveat:wght@400;700&family=Cinzel+Decorative:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Great+Vibes&family=Imperial+Script&family=Orbitron:wght@400;700&family=Patrick+Hand&family=Pinyon+Script&family=Pirata+One&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Rajdhani:wght@400;700&family=Sacramento&family=Satisfy&family=Share+Tech+Mono&family=UnifrakturMaguntia&display=swap" />
      </head>
      <body className="flex min-h-[100dvh] flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers session={null}>
            <div className="flex min-h-[100dvh] flex-col">
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </div>
          </Providers>
          <Toaster />
          <SonnerToaster />
          <ChunkLoadErrorHandler />
          <LiveUpdateCheck />
        </ThemeProvider>
      </body>
    </html>
  );
}
