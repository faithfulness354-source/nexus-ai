import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Local Privacy Assistant',
  description: 'Chat and generate images with local open-weight models — no commercial cloud APIs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <div className="h-dvh min-h-0">{children}</div>
      </body>
    </html>
  );
}
