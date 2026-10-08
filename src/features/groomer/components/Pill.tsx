import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-tint-neutral text-muted",
  info: "bg-tint-info text-info",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning",
  danger: "bg-tint-danger text-danger-ink",
} as const;

/**
 * A small labelled chip. ALWAYS carries words — colour alone never says a status
 * (ui-rules §1.3) — and never sets type below 13 px.
 */
export function Pill({
  tone = "neutral",
  children,
  icon,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}
