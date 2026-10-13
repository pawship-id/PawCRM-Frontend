"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { RoleTemplate } from "@/types/api";

/**
 * "Mulai dari template" — preset grant sets above the role editor. Picking one
 * REPLACES the ticks below; the role saved is an ordinary custom role, so the
 * owner adjusts it freely and later template changes never reach it.
 */
export function RoleTemplatePicker({
  templates,
  onPick,
}: {
  templates: RoleTemplate[];
  onPick: (template: RoleTemplate) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const current = templates.find((t) => t.key === picked);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">Mulai dari template</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Template peran">
        {templates.map((template) => (
          <button
            key={template.key}
            type="button"
            aria-pressed={picked === template.key}
            onClick={() => {
              setPicked(template.key);
              onPick(template);
            }}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-medium transition",
              "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              picked === template.key
                ? "border-primary bg-navy-100 text-primary"
                : "border-border bg-surface text-foreground hover:bg-surface-hover",
            )}
          >
            {template.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {current
          ? `${current.description} Hak akses di bawah sudah diisi — sesuaikan lalu simpan.`
          : "Opsional. Memilih template mengganti centang di bawah; setelah itu bebas diubah."}
      </p>
    </div>
  );
}
