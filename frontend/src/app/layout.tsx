import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BasisGuard",
  description:
    "Independent research-reliability and evaluation workbench built on Parallel APIs (not a Parallel product).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 px-6 py-3 flex gap-6 text-sm dark:border-white/15">
          <Link href="/" className="font-semibold">BasisGuard</Link>
          <Link href="/runs">Runs</Link>
          <Link href="/runs/new">New run</Link>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
