import type { Metadata } from "next";
import { AppShell } from "@/ui/app-shell";
import { jetbrainsMono, poppins } from "@/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "BasisGuard",
  description:
    "Independent research-reliability and evaluation workbench built on Parallel APIs (not a Parallel product).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${poppins.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
