import { Fragment } from "react";

/**
 * Renders `text` with every case-insensitive occurrence of `query` wrapped in a
 * yellow `<mark>`, so a user scanning a filtered list can see exactly which
 * characters matched their search.
 *
 * A pure display helper — it does no filtering, only highlighting. Pass the same
 * term the list was filtered on (e.g. the audit-log search over action / IP).
 * With no query it returns the text untouched, so it is always safe to wrap a
 * cell in it.
 */
export function HighlightText({
  text,
  query,
}: {
  text: string;
  /** The search term to highlight. Empty/whitespace renders plain text. */
  query?: string;
}) {
  const term = query?.trim();
  if (!term) return <>{text}</>;

  // Escape regex metacharacters so a term like "1.2" highlights that literal
  // substring rather than acting as a pattern — the same discipline the backend
  // search applies before building its RegExp.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Capturing group so split() keeps the matched substrings as array entries.
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark
            key={index}
            className="rounded-xs bg-yellow-200 text-inherit dark:bg-yellow-400/40"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
