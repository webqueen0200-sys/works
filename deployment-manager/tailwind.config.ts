import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Apple design system tokens (see DESIGN-apple.md)
        primary: {
          DEFAULT: "#0066cc",
          focus: "#0071e3",
          dark: "#2997ff", // primary-on-dark
        },
        ink: {
          DEFAULT: "#1d1d1f",
          80: "#333333",
          48: "#7a7a7a",
        },
        canvas: {
          DEFAULT: "#ffffff",
          parchment: "#f5f5f7",
          pearl: "#fafafc",
        },
        hairline: "#e0e0e0",
        "divider-soft": "#f0f0f0",
        "body-muted": "#cccccc",
        "chip-translucent": "#d2d2d7",
        "surface-black": "#000000",
        // kept as alias so any older "brand" references still resolve
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#0066cc",
          600: "#0071e3",
          700: "#1f3d99",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.374px",
        tighter: "-0.28px",
      },
      borderRadius: {
        xs: "5px",
        sm: "8px",
        md: "11px",
        lg: "18px",
        pill: "9999px",
      },
      boxShadow: {
        // the single system shadow — reserved for product imagery only,
        // kept here only for completeness, not used on UI chrome
        product: "3px 5px 30px 0 rgba(0, 0, 0, 0.22)",
      },
    },
  },
  plugins: [],
};
export default config;
