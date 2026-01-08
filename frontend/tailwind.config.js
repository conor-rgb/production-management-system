/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Bricolage Grotesque", "ui-sans-serif", "system-ui"],
        body: ["Space Grotesk", "ui-sans-serif", "system-ui"]
      },
      colors: {
        ink: "#0B0F1A",
        dusk: "#1C2333",
        mist: "#F4F6FB",
        accent: "#FFB347",
        accentDeep: "#FF7A00",
        mint: "#6AE7C8"
      }
    }
  },
  plugins: []
};
