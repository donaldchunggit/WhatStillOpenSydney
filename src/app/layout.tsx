import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What Still Open Sydney",
  description: "Find venues open at a given time in Sydney.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
