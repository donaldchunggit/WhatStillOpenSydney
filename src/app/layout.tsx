import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What Still Open Sydney",
  description: "Find venues that are open in Sydney at any time.",

  openGraph: {
    title: "What Still Open Sydney",
    description: "Find venues that are open in Sydney right now.",
    url: "https://what-still-open-sydney.vercel.app/",
    siteName: "What Still Open Sydney",
    images: [
      {
        url: "/whatstillopensydney.png",
        width: 1200,
        height: 630,
        alt: "What Still Open Sydney",
      },
    ],
    locale: "en_AU",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "What Still Open Sydney",
    description: "Find venues that are open in Sydney right now.",
    images: ["/whatstillopensydney.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
