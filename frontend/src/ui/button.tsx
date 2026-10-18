import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex min-h-11 sm:min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-petrol text-panel hover:bg-petrol-hover",
  secondary: "border border-line-strong bg-panel text-ink hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
};

const cls = (variant: ButtonVariant, extra?: string) => `${BASE} ${VARIANTS[variant]}${extra ? ` ${extra}` : ""}`;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={cls(variant, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cls(variant, className)} {...rest} />;
}
