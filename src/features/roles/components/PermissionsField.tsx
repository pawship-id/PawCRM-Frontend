"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PermissionGrant } from "@/types/api";

import type { PermissionSelection } from "../permissions";

/**
 * The permissions matrix: one row per catalog feature, a checkbox per action it
 * supports, plus a per-feature "all" toggle. Purely presentational — the parent
 * form owns the `selection` (a `feature -> actions[]` map) and the `catalog`
 * (from usePermissionCatalog); this renders them and reports every change up.
 *
 * When `disabled` (a deleted role, or a super-admin whose access is unconditional
 * and not editable) the whole grid is read-only.
 */

/** camelCase / lowercase catalog token -> a human label ("changePassword" -> "Change password"). */
function humanize(token: string): string {
  const spaced = token.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The common actions in Bahasa, the same words the module tree's labels use
 * (permissionModules.js ACTION_LABELS). This grid is only the fallback for a
 * catalog without a module tree, so the rarer actions fall back to `humanize`.
 */
const ACTION_LABELS: Record<string, string> = {
  read: "Lihat",
  create: "Tambah",
  update: "Ubah",
  delete: "Hapus",
  restore: "Pulihkan",
};

const actionLabel = (action: string) => ACTION_LABELS[action] ?? humanize(action);

/**
 * `read` is the prerequisite for every other action: you cannot update, delete
 * or otherwise touch a feature you cannot see. So granting any action implies
 * `read`, and revoking `read` revokes the whole feature.
 */
const READ_ACTION = "read";

export function PermissionsField({
  catalog,
  selection,
  onChange,
  disabled = false,
  error,
}: {
  catalog: PermissionGrant[];
  selection: PermissionSelection;
  onChange: (next: PermissionSelection) => void;
  disabled?: boolean;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  /** Replace one feature's action list, dropping the key when it empties out. */
  function setFeatureActions(feature: string, actions: string[]) {
    const next = { ...selection };
    if (actions.length > 0) next[feature] = actions;
    else delete next[feature];
    onChange(next);
  }

  function toggleAction(
    feature: string,
    available: string[],
    action: string,
    checked: boolean,
  ) {
    const current = selection[feature] ?? [];
    let actions: string[];

    if (checked) {
      // Granting any action pulls in `read` too — nothing is usable without it.
      const next = new Set([...current, action]);
      if (available.includes(READ_ACTION)) next.add(READ_ACTION);
      actions = [...next];
    } else if (action === READ_ACTION) {
      // Revoking `read` revokes access entirely, so clear the whole feature.
      actions = [];
    } else {
      actions = current.filter((a) => a !== action);
    }

    setFeatureActions(feature, actions);
  }

  function toggleFeature(
    feature: string,
    available: string[],
    checked: boolean,
  ) {
    setFeatureActions(feature, checked ? [...available] : []);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>Hak akses</Label>
        <span className="text-xs text-muted">
          Apa saja yang boleh dilakukan pemegang peran ini.
        </span>
      </div>

      <div
        id={id}
        role="group"
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "divide-y divide-border rounded-xl border border-border bg-card",
          error && "border-danger",
        )}
      >
        {catalog.map(({ feature, actions: available }) => {
          const selected = selection[feature] ?? [];
          const allChecked = selected.length === available.length;
          const someChecked = selected.length > 0 && !allChecked;

          return (
            <div
              key={feature}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6"
            >
              <label className="flex w-40 shrink-0 items-center gap-2 font-medium text-foreground">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    toggleFeature(feature, available, checked === true)
                  }
                  aria-label={`Semua akses ${humanize(feature)}`}
                />
                {humanize(feature)}
              </label>

              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {available.map((action) => {
                  const checkboxId = `${id}-${feature}-${action}`;
                  return (
                    <div key={action} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={selected.includes(action)}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          toggleAction(
                            feature,
                            available,
                            action,
                            checked === true,
                          )
                        }
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="font-normal text-muted-foreground"
                      >
                        {actionLabel(action)}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {catalog.length === 0 && (
          <p className="p-4 text-sm text-muted">
            Belum ada fitur yang bisa diberikan.
          </p>
        )}
      </div>

      {catalog.length > 0 && !disabled && (
        <p className="text-xs text-muted">
          “Lihat” wajib untuk akses — memilih aksi lain ikut mencentangnya, dan
          menghapusnya menghapus seluruh fitur.
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
