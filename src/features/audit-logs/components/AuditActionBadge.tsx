import { actionLabel, actionTone, type ActionTone } from "../constants";

// §9: pale named tint + saturated ink, never opacity arithmetic.
const TONE_CLASS: Record<ActionTone, string> = {
  neutral: "bg-tint-neutral text-primary",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning",
  danger: "bg-tint-danger text-danger-ink",
};

export function AuditActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[actionTone(action)]}`}
    >
      {actionLabel(action)}
    </span>
  );
}
