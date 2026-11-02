"use client";

import { Card } from "@/components/Card";
import { SkuText } from "@/components/SkuText";

/**
 * What a commit could not write — the report half of "penulisan berurutan".
 *
 * Everything predictable is refused before the first write, so these are
 * collisions that happened DURING it, and what came before them still stands.
 * Each entry names its rows, so the user fixes only those.
 */
export function ImportFailedList({
  title,
  description,
  entries,
}: {
  title: string;
  description: string;
  entries: { label: string; rowNumbers: number[]; message: string }[];
}) {
  return (
    <Card title={title} description={description}>
      <ul className="flex flex-col gap-2 text-sm">
        {entries.map((entry) => (
          <li key={entry.label} className="flex flex-col gap-0.5">
            <span className="tabular-nums text-xs">
              <SkuText value={entry.label} />{" "}
              <span className="text-muted">
                (baris {entry.rowNumbers.join(", ")})
              </span>
            </span>
            <span className="text-danger">{entry.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
