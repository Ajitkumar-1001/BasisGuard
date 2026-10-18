"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export function HashChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = value.length > 12 ? `${value.slice(0, 12)}…` : value;

  function copy() {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="num rounded-[4px] bg-sunken px-1.5 py-0.5 text-xs text-ink" title={value}>
        {shown}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={"Copy " + label}
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[4px] text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink"
      >
        <Icon name="copy" />
      </button>
      <span aria-live="polite" className="text-xs text-moss">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
