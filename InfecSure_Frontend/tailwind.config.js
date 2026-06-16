/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinical: {
          50: "#eefbfb",
          100: "#d5f4f4",
          600: "#0f7b83",
          700: "#0b6570",
          800: "#0b4f5d",
          900: "#0a3f4a"
        }
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
