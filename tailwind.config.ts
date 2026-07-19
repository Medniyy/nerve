import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: "#070D18",
        ink: "#070D18",
        card: "#0E1626",
        volt: "#38BDF8",
        mint: "#38BDF8",
        sky: "#38BDF8",
        amber: "#FFB020",
        danger: "#FF3B1F",
      },
      fontFamily: {
        display: ["Anton", "Impact", "sans-serif"],
        sans: ['"Chakra Petch"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
