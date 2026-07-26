import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Alert as UIAlert, AlertDescription } from "./ui/alert";

/**
 * Form-level feedback banner, backed by the shadcn/ui Alert.
 *
 * Keeps the project's `variant: error | success | info` API. shadcn ships
 * `default` and `destructive`; error maps to destructive, while success and
 * info are the default variant tinted with the brand feedback tokens.
 */
export interface AlertProps {
  variant?: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
}

const TINTS: Record<"success" | "info", string> = {
  success: "border-success/30 bg-success/10 text-success",
  info: "border-secondary/40 bg-secondary/15 text-secondary-foreground",
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
