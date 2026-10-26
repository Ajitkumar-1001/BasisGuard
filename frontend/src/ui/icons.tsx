import type { IconName } from "./status";

export type IconKey = IconName | "copy" | "chevron-right" | "external";

const PATHS: Record<IconKey, React.ReactNode> = {
  check: <path d="M4 12.5l5 5L20 6.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  minus: <path d="M5 12h14" />,
  flag: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
  alert: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  progress: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" />
    </>
  ),
  "link-off": (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      <path d="M4 4l16 16" />
    </>
  ),
  dash: <path d="M8 12h8" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
};

export function Icon({ name, className }: { name: IconKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
    >
      {PATHS[name]}
    </svg>
  );
}
