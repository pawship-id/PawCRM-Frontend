import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

/**
 * The one button. Variants map onto the brand tokens, so a palette change in
 * globals.css restyles every button with no edit here.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-primary",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary-hover focus-visible:ring-secondary",
  ghost:
    "bg-transparent text-primary hover:bg-primary/10 focus-visible:ring-primary",
};

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5",
        "text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
        fullWidth ? "w-full" : "",
        VARIANTS[variant],
        className ?? "",
      ].join(" ")}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
