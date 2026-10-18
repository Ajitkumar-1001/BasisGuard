"use client";

import { useRef, useState } from "react";

export type TabDef = { id: string; label: string; content: React.ReactNode };

export function Tabs({ tabs, defaultId, label }: { tabs: TabDef[]; defaultId: string; label: string }) {
  const [active, setActive] = useState(defaultId);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    setActive(target.id);
    refs.current.get(target.id)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
                else refs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px min-h-11 shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors duration-150 sm:min-h-9 ${
                selected ? "border-petrol text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
