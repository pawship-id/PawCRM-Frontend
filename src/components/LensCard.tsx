"use client";

import { cn } from "@/lib/utils";

/*
 * PROMOTED FROM features/memberships (8 November 2026) when Promosi › Promo
 * took the same status strip as Anggota — ui-rules §14, second feature.
 */

/**
 * One status card in the lens row — a label and its count, pressed to narrow
 * the table, pressed again to let go. Spans, not paragraphs: it is a button.
 */
export function LensCard({
  label,
  count,
  tone,
  pressed,
  onPress,
}: {
  label: string;
  count: number | undefined;
  tone: "default" | "warning";
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        "flex w-full cursor-pointer flex-col items-start rounded-xl border p-4 text-left transition",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        pressed ? "border-primary bg-navy-100" : "border-border bg-surface",
      )}
    >
      <span className="text-sm text-muted">{label}</span>
      <span
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {count ?? "—"}
      </span>
    </button>
  );
}
