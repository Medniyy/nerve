import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NERVE — Cash out before the goal",
  description:
    "A crash-style nerve game on real football data. The multiplier climbs while nobody scores — cash out before a real goal crashes the round, or play a room with up to 5 friends.",
  openGraph: {
    title: "NERVE — Cash out before the goal",
    description:
      "The multiplier climbs while nobody scores. Cash out before a real goal crashes the round — solo or in a room with friends.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#070D18",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
