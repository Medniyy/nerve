import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NERVE — Live in-play football markets",
  description:
    "Take a side on the next real football moment. Watch your position move with live TxLINE odds and cash out — or hold to settlement — against the crowd on Solana.",
  openGraph: {
    title: "NERVE — Live in-play football markets",
    description:
      "Take a side on the next real football moment, watch it move with live data, settle against the crowd on Solana.",
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
