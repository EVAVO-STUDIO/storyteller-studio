import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./artifacts.css";
import "./calibration.css";

export const metadata: Metadata = {
  title: {
    default: "EVAVO Storyteller Studio",
    template: "%s · EVAVO Storyteller Studio",
  },
  description: "A private production workspace for directed long-form narration, audiobook quality and illustrated story companions.",
  applicationName: "EVAVO Storyteller Studio",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#080808",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
