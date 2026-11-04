import { formatHelpDate, helpRelease } from "../content";

/**
 * "Panduan versi 1.2 · diperbarui 4 November 2026" — how old the text is.
 *
 * The guide is revised on request, not with every release, so a screen may
 * have moved on since. Pass a topic's own date to show when THAT topic was
 * last revised; without one it is the guide's as a whole.
 */
export function HelpVersion({ updatedAt, className }: { updatedAt?: string; className?: string }) {
  const release = helpRelease();
  const date = updatedAt ?? release.updatedAt;
  return (
    <p className={className ?? "text-xs text-muted"}>
      Panduan versi <span className="tabular-nums">{release.version}</span> · diperbarui{" "}
      <time dateTime={date} className="tabular-nums">
        {formatHelpDate(date)}
      </time>
    </p>
  );
}
