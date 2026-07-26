import { Badge } from "@/components/ui/badge";
import { HighlightText } from "@/components";

import { actionLabel, actionTone, type ActionTone } from "../constants";

/**
 * A tinted badge for an audit action — green for a login, amber for a failed
 * one, red for a lockout, neutral otherwise. Mirrors the RoleStatusBadge tinting
 * approach: a feedback token applied as a className over the outline badge.
 *
 * The tone/label come from the action vocabulary (constants.ts), which degrades
 * gracefully for an action the UI has not learned yet — so a new backend event
 * shows a humanized neutral badge, never a blank.
 */
// The theme exposes success / danger / primary / muted feedback tokens (no
// dedicated "warning"), so the amber-ish warning tone borrows `primary` — an
// attention tint that reads as "notable but not an error".
const TONE_CLASS: Record<ActionTone, string> = {
  neutral: "bg-muted/40 text-muted",
  success: "bg-success/12 text-success",
  warning: "bg-primary/10 text-primary",
  danger: "bg-danger/10 text-danger",
};

export function AuditActionBadge({
  action,
  query,
}: {
  action: string;
  /** Search term to highlight within the label, if it matches. */
  query?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${TONE_CLASS[actionTone(action)]}`}
    >
      {/* Wrapped in one span so the Badge's `gap-1` flex spacing does not fall
          between HighlightText's text/mark fragments (which would split e.g.
          "Login" into "Lo gin"). Inside the span they sit inline, gap-free. */}
      <span>
        <HighlightText text={actionLabel(action)} query={query} />
      </span>
    </Badge>
  );
}
