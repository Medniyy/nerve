import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "NERVE — Demo",
  description: "NERVE product demo.",
};

/** Demo video is hosted on GitHub Pages (free bandwidth), not Railway. */
const DEMO_URL = "https://medniyy.github.io/nerve/";

export default function PitchPage() {
  redirect(DEMO_URL);
}
