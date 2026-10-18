import Link from "next/link";
import { Suspense } from "react";
import { NavLink } from "./nav-link";

const NAV = [
  { href: "/", label: "Overview", match: "exact" },
  { href: "/runs", label: "Runs", match: "runs" },
  { href: "/runs/new", label: "New run", match: "exact" },
  { href: "/evaluations", label: "Evaluations", match: "prefix" },
] as const;

function Nav() {
  return (
    <>
      {NAV.map((n) => (
        <NavLink key={n.href} href={n.href} match={n.match}>
          {n.label}
        </NavLink>
      ))}
    </>
  );
}

// Static fallback: same links, no active state (usePathname is request-time under cacheComponents).
function NavFallback() {
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2 text-sm font-medium text-ink-muted">
          {n.label}
        </Link>
      ))}
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="text-base font-semibold text-ink">
      BasisGuard
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-petrol"
      >
        Skip to content
      </a>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="px-4 py-5">
          <Wordmark />
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-2">
          <Suspense fallback={<NavFallback />}>
            <Nav />
          </Suspense>
        </nav>
        <div className="space-y-2 border-t border-line px-4 py-4 text-xs text-ink-muted">
          <p className="font-mono">fixture · prototype</p>
          <p>Independent tool built on Parallel APIs — not a Parallel product</p>
        </div>
      </aside>
      <header className="border-b border-line bg-panel px-4 py-3 sm:px-6 lg:hidden">
        <Wordmark />
        <nav aria-label="Primary" className="mt-2 flex flex-wrap gap-1">
          <Suspense fallback={<NavFallback />}>
            <Nav />
          </Suspense>
        </nav>
      </header>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-6 lg:hidden">
          <p className="font-mono">fixture · prototype</p>
          <p>Independent tool built on Parallel APIs — not a Parallel product</p>
        </footer>
      </div>
    </div>
  );
}
