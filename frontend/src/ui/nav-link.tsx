"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Match = "exact" | "runs" | "prefix";

const BASE = "block rounded-md px-3 py-2 text-sm font-medium";

function isActive(pathname: string, href: string, match: Match): boolean {
  if (match === "exact") return pathname === href;
  if (match === "runs") return pathname === href || (pathname.startsWith(`${href}/`) && pathname !== "/runs/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, match, children }: { href: string; match: Match; children: React.ReactNode }) {
  const active = isActive(usePathname(), href, match);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? "bg-petrol-tint text-petrol" : "text-ink-muted hover:bg-sunken hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
