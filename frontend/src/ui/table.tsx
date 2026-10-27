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
      className={`sticky top-0 z-10 border-b border-line-strong bg-panel px-3 py-2 text-xs font-medium text-ink-muted ${numeric ? "text-right" : "text-left"}${className ? ` ${className}` : ""}`}
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
