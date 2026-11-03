/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        sumi: "#16120f",
        washi: "#ece5d3",
        emerald: { cloth: "#0e5a43", deep: "#083a2b", glow: "#3ee59a" },
        foil: "#c9a24a",
        amber: "#e8a65a",
        shu: "#c2412d"
      },
      fontFamily: {
        display: ['"Dela Gothic One"', '"Arial Black"', "sans-serif"],
        ui: ['"Zen Kaku Gothic New"', "system-ui", "sans-serif"],
        bubble: ['"Comic Neue"', '"Comic Sans MS"', "cursive"]
      }
    }
  },
  plugins: []
};
