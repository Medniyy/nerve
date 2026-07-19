import type { Metadata, Viewport } from "next";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NERVE — Don’t just watch the match",
  description:
    "NERVE turns watching live football into a shared adrenaline rush, where every attack feels personal and every second tests your nerve.",
  openGraph: {
    title: "NERVE — Don’t just watch the match",
    description:
      "Turn live football into a shared adrenaline game with friends.",
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
