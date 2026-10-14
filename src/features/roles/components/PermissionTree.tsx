"use client";

import { useId, useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  PermissionModule,
  PermissionPage,
  PermissionScreen,
} from "@/types/api";

import type { PermissionSelection } from "../permissions";

/**
 * The role editor as a tree: modul → halaman → tab → aksi — the same shape as
 * the sidebar and the tab row on each page (14 October 2026, on request).
 *
 * Grants are still `feature:action`; the tree is only how they are laid out,
 * so the parent form, the payload and the backend are unchanged. Ticking a
 * module ticks every page in it, a page every tab, a tab every action, and each
 * level shows a dash when it is partly granted.
 *
 * "LIHAT" OPENS A TAB. Ticking any action on a tab ticks that tab's Lihat too,
 * and clearing Lihat clears the whole tab — a tab whose Lihat is off is hidden
 * in the app, so nothing else on it could be used anyway.
 */

const READ_ACTION = "read";

type Pair = [string, string];
type CheckState = boolean | "indeterminate";

/** Every `feature:action` pair a tab covers. */
function tabPairs(tab: PermissionScreen): Pair[] {
  return tab.features.flatMap(({ feature, actions }) =>
    actions.map((a): Pair => [feature, a.key]),
  );
}

const pagePairs = (page: PermissionPage) => page.tabs.flatMap(tabPairs);
const modulePairs = (module: PermissionModule) => module.pages.flatMap(pagePairs);

const isGranted = (selection: PermissionSelection, [f, a]: Pair) =>
  selection[f]?.includes(a) ?? false;

function countGranted(pairs: Pair[], selection: PermissionSelection) {
  return pairs.filter((pair) => isGranted(selection, pair)).length;
}

function stateOf(pairs: Pair[], selection: PermissionSelection): CheckState {
  const granted = countGranted(pairs, selection);
  if (granted === 0) return false;
  return granted === pairs.length ? true : "indeterminate";
}

/** Grants or revokes every pair at once; a feature left empty is dropped. */
function setPairs(
  selection: PermissionSelection,
  pairs: Pair[],
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
  // on what it can do rather than on a column of closed rows.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        modules
          .filter((m) => countGranted(modulePairs(m), selection) > 0)
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

  /** One action on one tab, with the tab's Lihat rule applied. */
  function toggleAction(tab: PermissionScreen, pair: Pair, checked: boolean) {
    const pairs = tabPairs(tab);
    const readPairs = pairs.filter(([, action]) => action === READ_ACTION);
    const isRead = pair[1] === READ_ACTION;

    if (!checked && isRead) {
      onChange(setPairs(selection, pairs, false));
      return;
    }
    const next = setPairs(selection, [pair], checked);
    onChange(checked ? setPairs(next, readPairs, true) : next);
  }

  const allPairs = modules.flatMap(modulePairs);
  const grantedCount = countGranted(allPairs, selection);

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
            className="min-h-11 rounded-md px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() => setOpen(new Set(modules.map((m) => m.key)))}
          >
            Buka semua
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          const pairs = modulePairs(module);
          const granted = countGranted(pairs, selection);
          const expanded = open.has(module.key);
          const panelId = `${id}-${module.key}`;

          return (
            <section key={module.key}>
              <div className="flex items-center gap-3 px-4 py-1.5">
                <Checkbox
                  checked={stateOf(pairs, selection)}
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
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="font-semibold text-foreground">
                    {module.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {granted > 0 ? `${granted}/${pairs.length}` : "Tidak ada akses"}
                    <ChevronRight
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-90",
                      )}
                      aria-hidden
                    />
                  </span>
                </button>
              </div>

              {expanded && (
                <div
                  id={panelId}
                  className="divide-y divide-border border-t border-border bg-background"
                >
                  {module.pages.map((page) =>
                    /*
                      A module with ONE page (Pelanggan, Penjualan, Keuangan…)
                      skips the page row: "Pelanggan › Pelanggan" says nothing
                      the module row did not, so its tabs sit right under it.
                    */
                    module.pages.length === 1 && !page.single ? (
                      page.tabs.map((tab) => (
                        <TabRow
                          key={tab.key}
                          idPrefix={`${id}-${module.key}-${page.key}-${tab.key}`}
                          tab={tab}
                          depth={1}
                          selection={selection}
                          disabled={disabled}
                          onToggleTab={(checked) =>
                            onChange(setPairs(selection, tabPairs(tab), checked))
                          }
                          onToggleAction={toggleAction}
                        />
                      ))
                    ) : page.single ? (
                      <TabRow
                        key={page.key}
                        idPrefix={`${id}-${module.key}-${page.key}`}
                        tab={page.tabs[0]}
                        depth={1}
                        selection={selection}
                        disabled={disabled}
                        onToggleTab={(checked) =>
                          onChange(setPairs(selection, pagePairs(page), checked))
                        }
                        onToggleAction={toggleAction}
                      />
                    ) : (
                      <PageBlock
                        key={page.key}
                        idPrefix={`${id}-${module.key}-${page.key}`}
                        page={page}
                        selection={selection}
                        disabled={disabled}
                        onSet={(pairsToSet, checked) =>
                          onChange(setPairs(selection, pairsToSet, checked))
                        }
                        onToggleAction={toggleAction}
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!disabled && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          Aksi bertanda ini sensitif (uang, pembatalan, ubah harga). “Lihat”
          membuka tabnya — tanpa itu tab disembunyikan, dan memilih aksi lain
          ikut mencentangnya.
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

/** A page with tabs: its own row, then one row per tab beneath it. */
function PageBlock({
  idPrefix,
  page,
  selection,
  disabled,
  onSet,
  onToggleAction,
}: {
  idPrefix: string;
  page: PermissionPage;
  selection: PermissionSelection;
  disabled: boolean;
  onSet: (pairs: Pair[], checked: boolean) => void;
  onToggleAction: (tab: PermissionScreen, pair: Pair, checked: boolean) => void;
}) {
  const pairs = pagePairs(page);
  const granted = countGranted(pairs, selection);

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 py-1.5 pl-11 pr-4">
        <Checkbox
          checked={stateOf(pairs, selection)}
          disabled={disabled}
          onCheckedChange={(checked) => onSet(pairs, checked === true)}
          aria-label={`Semua akses halaman ${page.label}`}
        />
        <span className="text-sm font-semibold text-foreground">{page.label}</span>
        <span className="ml-auto text-xs text-muted">
          {granted > 0 ? `${granted}/${pairs.length}` : ""}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {page.tabs.map((tab) => (
          <TabRow
            key={tab.key}
            idPrefix={`${idPrefix}-${tab.key}`}
            tab={tab}
            depth={2}
            selection={selection}
            disabled={disabled}
            onToggleTab={(checked) => onSet(tabPairs(tab), checked)}
            onToggleAction={onToggleAction}
          />
        ))}
      </div>
    </div>
  );
}

/** One tab (or a page with no tabs): its box, its name, its actions. */
function TabRow({
  idPrefix,
  tab,
  depth,
  selection,
  disabled,
  onToggleTab,
  onToggleAction,
}: {
  idPrefix: string;
  tab: PermissionScreen;
  depth: 1 | 2;
  selection: PermissionSelection;
  disabled: boolean;
  onToggleTab: (checked: boolean) => void;
  onToggleAction: (tab: PermissionScreen, pair: Pair, checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 py-3 pr-4 sm:flex-row sm:items-start sm:gap-6",
        depth === 1 ? "pl-11" : "pl-[4.25rem]",
      )}
    >
      <label className="flex shrink-0 items-start gap-2 sm:w-56">
        <Checkbox
          className="mt-0.5"
          checked={stateOf(tabPairs(tab), selection)}
          disabled={disabled}
          onCheckedChange={(checked) => onToggleTab(checked === true)}
          aria-label={`Semua akses ${tab.label}`}
        />
        <span className="flex flex-col">
          <span
            className={cn(
              "text-sm text-foreground",
              depth === 1 ? "font-semibold" : "font-medium",
            )}
          >
            {tab.label}
          </span>
          {tab.description && (
            <span className="text-xs text-muted">{tab.description}</span>
          )}
        </span>
      </label>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {tab.features.flatMap(({ feature, actions }) =>
          actions.map((action) => {
            const checkboxId = `${idPrefix}-${feature}-${action.key}`;
            const pair: Pair = [feature, action.key];
            return (
              <div key={checkboxId} className="flex items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={isGranted(selection, pair)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onToggleAction(tab, pair, checked === true)
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
          }),
        )}
      </div>
    </div>
  );
}
