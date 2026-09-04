import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Alert as UIAlert, AlertDescription } from "./ui/alert";

/**
 * Form-level feedback banner, backed by the shadcn/ui Alert.
 *
 * Keeps the project's `variant: error | success | info | warning` API. shadcn
 * ships `default` and `destructive`; error maps to destructive, while the other
 * three are the default variant tinted with the brand feedback tokens.
 *
 * WARNING SITS BETWEEN INFO AND ERROR, and the gap was real: a form that has
 * spotted something questionable but is still willing to submit had only a navy
 * info banner (which reads as "for your information", so nobody stops) or a red
 * error one (which reads as "this will fail", which is a lie when the button
 * still works). The receipt form's wrong-tab rows are exactly that shape.
 */
export interface AlertProps {
  variant?: "error" | "success" | "info" | "warning";
  children: ReactNode;
  className?: string;
}

const TINTS: Record<"success" | "info" | "warning", string> = {
  success: "border-success/30 bg-success/10 text-success",
  // Info is navy. It used to ride on --secondary, which is now orange — an
  // orange info banner would read as "act now" and eat the 5% orange budget.
  info: "border-info/30 bg-info/10 text-info",
  /**
   * `--warning` (#B96A05), NOT `--secondary`.
   *
   * They are both orange and only one of them is legible: `--secondary` is
   * 2.1:1 on white and is a FILL, never text. `--warning` is the darkened orange
   * the rules keep for exactly this — orange-ish text on a light surface. The
   * tint is 10% of it rather than `--tint-warning`, so the three variants here
   * are built the same way and cannot drift apart.
   */
  warning: "border-warning/30 bg-warning/10 text-warning",
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  const isError = variant === "error";

  return (
    <UIAlert
      variant={isError ? "destructive" : "default"}
      className={cn(!isError && TINTS[variant], className)}
    >
      <AlertDescription className={cn(!isError && "text-current")}>
        {children}
      </AlertDescription>
    </UIAlert>
  );
}
