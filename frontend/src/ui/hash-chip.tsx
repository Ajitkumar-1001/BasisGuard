"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { truncateHash } from "./hash-util";

export function HashChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = truncateHash(value);

  function flash(result: "copied" | "failed") {
    setCopied(result);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  }

  function copy() {
    const clip = navigator.clipboard as Clipboard | undefined;
    if (!clip?.writeText) {
      flash("failed");
      return;
    }
    clip.writeText(value).then(
      () => flash("copied"),
      () => flash("failed"),
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
        {copied === "copied" ? "Copied" : copied === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}
