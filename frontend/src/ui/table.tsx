export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-md border border-line bg-panel${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export function Tr({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`transition-colors duration-150 hover:bg-petrol-tint${className ? ` ${className}` : ""}`} {...rest} />
  );
}

export function Th({
  numeric,
  className,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 bg-sunken px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted ${numeric ? "text-right" : "text-left"}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export function Td({
  numeric,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={`border-t border-line px-3 py-2 text-sm text-ink ${numeric ? "num text-right" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
