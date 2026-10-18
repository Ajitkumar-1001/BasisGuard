import localFont from "next/font/local";

export const poppins = localFont({
  src: [
    { path: "../fonts/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-poppins",
});

export const jetbrainsMono = localFont({
  src: [{ path: "../fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" }],
  display: "swap",
  variable: "--font-jetbrains",
});
