/**
 * The audit-log action vocabulary the UI knows how to label and tint.
 *
 * Mirrors KNOWN_ACTIONS in PawCRM-Backend/src/models/auditLog.model.js — the
 * events the backend emits today. Like the permission catalog, this is a
 * hand-synced copy: the vocabulary lives in backend code, so a copy here is
 * unavoidable and both change together when a new event is added.
 *
 * The vocabulary is OPEN, not a closed enum: an `action` the backend emits that
 * is not listed here still renders correctly — `actionLabel` falls back to a
 * humanized slug and `actionTone` to a neutral tint — so a new backend event
 * never shows as broken UI while this list catches up.
 */

/** A badge tint token, mapped to a feedback colour in AuditActionBadge. */
export type ActionTone = "neutral" | "success" | "warning" | "danger";

interface ActionMeta {
  label: string;
  tone: ActionTone;
}

const ACTION_META: Record<string, ActionMeta> = {
  login: { label: "Login", tone: "success" },
  failed_login: { label: "Failed login", tone: "warning" },
  account_locked: { label: "Account locked", tone: "danger" },
  logout_all: { label: "Logout (all devices)", tone: "neutral" },
};

/** The actions offered in the toolbar filter, in a sensible display order. */
export const AUDIT_ACTION_OPTIONS: { value: string; label: string }[] = [
  "login",
  "failed_login",
  "account_locked",
  "logout_all",
].map((value) => ({ value, label: ACTION_META[value].label }));

/** Turns a raw slug into "Failed login"; humanizes an unknown slug gracefully. */
export function actionLabel(action: string): string {
  return (
    ACTION_META[action]?.label ??
    action
      .replace(/[_.]/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** The badge tint for an action; neutral for anything not in the catalog. */
export function actionTone(action: string): ActionTone {
  return ACTION_META[action]?.tone ?? "neutral";
}
