import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1320px" } },
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-2": "rgb(var(--line-2) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        lime: "rgb(var(--lime) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        violet: "rgb(var(--violet) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.04) inset",
        lift: "0 18px 50px -20px rgb(0 0 0 / 0.8)",
      },
      fontSize: {
        "2xs": ["10.5px", { lineHeight: "14px", letterSpacing: "0.06em" }],
        "3xs": ["9.5px", { lineHeight: "12px", letterSpacing: "0.08em" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 160ms cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.8s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
