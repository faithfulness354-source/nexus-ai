import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Syne } from "next/font/google";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler";
import { SiteFooter } from "@/components/layout/site-footer";
import { StartupSplash } from "@/components/splash/startup-screen";
import { LiveUpdateCheck } from "@/components/live-update-check";
import { TermsOfServiceGate } from "@/components/terms-of-service-gate";

import "@/app/globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-syne",
});

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

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
    <html lang="en" suppressHydrationWarning className={`dark ${syne.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Audiowide&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,700;1,6..96,400&family=Caveat:wght@400;700&family=Cinzel+Decorative:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Great+Vibes&family=Imperial+Script&family=Orbitron:wght@400;700&family=Patrick+Hand&family=Pinyon+Script&family=Pirata+One&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Rajdhani:wght@400;700&family=Sacramento&family=Satisfy&family=Share+Tech+Mono&family=UnifrakturMaguntia&display=swap" />
        <link rel="preload" href="/splash/intro.mp4" as="video" />
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var c=window.Capacitor;var native=!!(c&&typeof c.isNativePlatform==='function'&&c.isNativePlatform());if(!native&&/; wv\\)/.test(navigator.userAgent||''))native=true;if(native)document.documentElement.setAttribute('data-native-app','1');}catch(e){}})();" }} />
      </head>
      <body className="flex min-h-[100dvh] flex-col font-sans">
        <StartupSplash />
        <Suspense fallback={null}>
          <AuthenticatedShell>{children}</AuthenticatedShell>
        </Suspense>
      </body>
    </html>
  );
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (error) {
    console.error('Session lookup skipped', error instanceof Error ? error.message : '');
  }
  return (
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers session={session}>
            <TermsOfServiceGate>
              <div className="flex min-h-[100dvh] flex-col">
                <div className="flex-1">{children}</div>
                <SiteFooter />
              </div>
            </TermsOfServiceGate>
          </Providers>
          <Toaster />
          <SonnerToaster />
          <ChunkLoadErrorHandler />
          <LiveUpdateCheck />
        </ThemeProvider>
  );
}
