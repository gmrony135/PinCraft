/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pin: {
          50: "#fff1f2",
          100: "#ffe0e3",
          200: "#ffc6cc",
          300: "#ff9da7",
          400: "#ff6474",
          500: "#f92d47",
          600: "#e60023",
          700: "#c2001d",
          800: "#a1031c",
          900: "#86091d",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Noto Sans Bengali",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.12)",
        pop: "0 20px 45px -20px rgba(230,0,35,.45)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.22,1,.36,1) both",
        "pop-in": "pop-in .3s cubic-bezier(.22,1,.36,1) both",
      },
    },
  },
  plugins: [],
};
