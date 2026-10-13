"use client";

import { useId, useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PermissionModule, PermissionScreen } from "@/types/api";

import type { PermissionSelection } from "../permissions";

/**
 * The role editor as a tree: modul → layar → aksi.
 *
 * Grants are still `feature:action` — the tree is only how they are laid out,
 * so the parent form, the payload and the backend are the same as with the flat
 * PermissionsField this replaces. Ticking a module ticks every screen in it,
 * ticking a screen ticks every action on it, and each level shows a dash when
 * it is partly granted.
 *
 * The `read` rule is the matrix's: any action pulls in `read` on its feature,
 * and clearing `read` clears that feature.
 */

const READ_ACTION = "read";

type CheckState = boolean | "indeterminate";

/** Every `feature:action` pair a screen covers. */
function screenPairs(screen: PermissionScreen): [string, string][] {
  return screen.features.flatMap(({ feature, actions }) =>
    actions.map((a): [string, string] => [feature, a.key]),
  );
}

function stateOf(pairs: [string, string][], selection: PermissionSelection): CheckState {
  const granted = pairs.filter(([f, a]) => selection[f]?.includes(a)).length;
  if (granted === 0) return false;
  return granted === pairs.length ? true : "indeterminate";
}

/** Grants or revokes every pair at once; a feature left empty is dropped. */
function setPairs(
  selection: PermissionSelection,
  pairs: [string, string][],
  checked: boolean,
): PermissionSelection {
  const next: PermissionSelection = { ...selection };
  for (const [feature, action] of pairs) {
    const current = new Set(next[feature] ?? []);
    if (checked) current.add(action);
    else current.delete(action);
    if (current.size > 0) next[feature] = [...current];
    else delete next[feature];
  }
  return next;
}

export function PermissionTree({
  modules,
  selection,
  onChange,
  disabled = false,
  error,
}: {
  modules: PermissionModule[];
  selection: PermissionSelection;
  onChange: (next: PermissionSelection) => void;
  disabled?: boolean;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  // Modules that already hold a grant open expanded, so editing a role starts
  // on what it can do rather than on nine closed rows.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        modules
          .filter((m) => stateOf(m.screens.flatMap(screenPairs), selection) !== false)
          .map((m) => m.key),
      ),
  );

  function toggleOpen(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
      const next = new Set([...current, action]);
      if (available.includes(READ_ACTION)) next.add(READ_ACTION);
      actions = [...next];
    } else if (action === READ_ACTION) {
      actions = [];
    } else {
      actions = current.filter((a) => a !== action);
    }
    const next = { ...selection };
    if (actions.length > 0) next[feature] = actions;
    else delete next[feature];
    onChange(next);
  }

  const allPairs = modules.flatMap((m) => m.screens.flatMap(screenPairs));
  const grantedCount = allPairs.filter(([f, a]) => selection[f]?.includes(a)).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={id}>Hak akses</Label>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            {grantedCount} dari {allPairs.length} aksi
          </span>
          <button
            type="button"
            className="min-h-11 px-1 font-medium text-primary hover:underline rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() => setOpen(new Set(modules.map((m) => m.key)))}
          >
            Buka semua
          </button>
          <button
            type="button"
            className="min-h-11 px-1 font-medium text-primary hover:underline rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() => setOpen(new Set())}
          >
            Tutup semua
          </button>
        </div>
      </div>

      <div
        id={id}
        role="group"
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "divide-y divide-border rounded-xl border border-border bg-surface",
          error && "border-danger",
        )}
      >
        {modules.map((module) => {
          const pairs = module.screens.flatMap(screenPairs);
          const state = stateOf(pairs, selection);
          const granted = pairs.filter(([f, a]) => selection[f]?.includes(a)).length;
          const expanded = open.has(module.key);
          const panelId = `${id}-${module.key}`;

          return (
            <section key={module.key}>
              <div className="flex items-center gap-3 px-4 py-1.5">
                <Checkbox
                  checked={state}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(setPairs(selection, pairs, checked === true))
                  }
                  aria-label={`Semua akses ${module.label}`}
                />
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(module.key)}
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-left rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="font-semibold text-foreground">{module.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {granted > 0 ? `${granted}/${pairs.length}` : "Tidak ada akses"}
                    <ChevronRight
                      className={cn("size-4 transition-transform", expanded && "rotate-90")}
                      aria-hidden
                    />
                  </span>
                </button>
              </div>

              {expanded && (
                <div id={panelId} className="divide-y divide-border border-t border-border bg-background">
                  {module.screens.map((screen) => (
                    <ScreenRow
                      key={screen.key}
                      idPrefix={`${id}-${screen.key}`}
                      screen={screen}
                      selection={selection}
                      disabled={disabled}
                      onToggleScreen={(checked) =>
                        onChange(setPairs(selection, screenPairs(screen), checked))
                      }
                      onToggleAction={toggleAction}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!disabled && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          Aksi bertanda ini sensitif (uang, pembatalan, ubah harga). “Lihat” wajib
          untuk aksi lain dan ikut tercentang otomatis.
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

function ScreenRow({
  idPrefix,
  screen,
  selection,
  disabled,
  onToggleScreen,
  onToggleAction,
}: {
  idPrefix: string;
  screen: PermissionScreen;
  selection: PermissionSelection;
  disabled: boolean;
  onToggleScreen: (checked: boolean) => void;
  onToggleAction: (
    feature: string,
    available: string[],
    action: string,
    checked: boolean,
  ) => void;
}) {
  const state = stateOf(screenPairs(screen), selection);

  return (
    <div className="flex flex-col gap-2.5 py-3 pl-11 pr-4 sm:flex-row sm:items-start sm:gap-6">
      <label className="flex shrink-0 items-start gap-2 sm:w-56">
        <Checkbox
          className="mt-0.5"
          checked={state}
          disabled={disabled}
          onCheckedChange={(checked) => onToggleScreen(checked === true)}
          aria-label={`Semua akses ${screen.label}`}
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{screen.label}</span>
          {screen.description && (
            <span className="text-xs text-muted">{screen.description}</span>
          )}
        </span>
      </label>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {screen.features.flatMap(({ feature, actions }) => {
          const available = actions.map((a) => a.key);
          return actions.map((action) => {
            const checkboxId = `${idPrefix}-${feature}-${action.key}`;
            return (
              <div key={checkboxId} className="flex items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={selection[feature]?.includes(action.key) ?? false}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onToggleAction(feature, available, action.key, checked === true)
                  }
                />
                <Label
                  htmlFor={checkboxId}
                  className="flex items-center gap-1 font-normal text-muted"
                >
                  {action.label}
                  {action.sensitive && (
                    <ShieldAlert
                      className="size-3.5 text-warning"
                      aria-label="sensitif"
                    />
                  )}
                </Label>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
