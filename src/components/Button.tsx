import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Button as UIButton } from "./ui/button";
import { Spinner } from "./Spinner";

/**
 * App-facing button, backed by the shadcn/ui Button.
 *
 * Keeps the project's existing API (`variant: primary|secondary|ghost`,
 * `loading`, `fullWidth`) so every call site stays unchanged while the actual
 * markup and styling now come from shadcn. The variant names map onto shadcn's:
 * primary -> default. For shadcn-only variants (outline, destructive, link) use
 * the underlying `@/components/ui/button` directly.
 */
export interface ButtonProps extends ComponentProps<"button"> {
  variant?: "primary" | "secondary" | "ghost";
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_MAP = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
} as const;

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
    <UIButton
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      className={cn(fullWidth && "w-full", className)}
      {...props}
    >
      {loading && <Spinner size={16} />}
      {children}
    </UIButton>
  );
}
