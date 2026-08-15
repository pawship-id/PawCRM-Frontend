# Component specs

Rules in [`docs/ui-rules.md`](./ui-rules.md) override this file.

Each entry gives: when to use → props → anatomy → states → copy → accessibility.

**The filter layer is built** and lives in [`src/components/filters/`](../src/components/filters/), exported through `@/components`. All 15 toolbars use it. Where this document and the code disagree, the code is right and this document is stale — say so in a PR rather than "fixing" the code back.

Everything under *Page structure*, *Status* and *Tables* is still **specified, not built**. Build one when the work actually calls for it, to this spec rather than to a parallel invention, and delete its "not built" note once it ships.

## What the real toolbars changed about this spec

Seven amendments, each discovered by holding the original spec against the fifteen toolbars it was meant to describe:

1. **`FilterToggle` was missing entirely.** The census found nine boolean filters — eight on the shadcn `Checkbox`, one on a raw `<input type="checkbox">`. It is specified below now.
2. **`FilterSelect` takes `value: T` and `unsetValue?: NoInfer<T>`,** not `value: T | null`. The repo's unset convention is `""` or `false`, never null — and three different conventions coexist, so which value means "not filtering" has to be nameable per field. `NoInfer` keeps that prop from voting on the generic, which is what lets `unsetValue="all"` type-check without a cast.
3. **`FilterSelect` gained `disabled` and `disabledHint`.** Batches suspends its horizon during a search and StockCard disables everything until a product is picked. Both already carried prose explaining it; a disabled control with no explanation reads as a bug.
4. **`FilterPills` options gained `tone`.** Payables' overdue lens is the one filter value that carries urgency.
5. **`FilterBar` gained `meta`, `actions` and `hint`, and `search` became a `ReactNode`** rather than a `{value, onChange, placeholder}` object. Ten of the buttons that land in `actions` are wrapped in a `<Can>` permission gate, so a config shape would drag permissions into a shared component; and the object form for search would have needed `ariaLabel`, `disabled` and `className` within a month.
6. **`FilterDateRange` takes `string`, not `string | null`,** and the default presets are `Hari ini / 7 hari / 30 hari / Bulan ini`. The "Kustom" chip is gone — the two inputs beneath it *are* custom. Reset applies immediately, so there is no separate `onReset`: `onApply({from:"", to:""})` already says it.
7. **Search sits far right**, per this spec, where fourteen of fifteen toolbars used to put it first-left. That and Payables' segmented control becoming a pill row are the only two changes a user will visibly notice.

---

# Filters

**Built.** `src/components/filters/`, re-exported from `@/components`. Read [`docs/ui-rules.md`](./ui-rules.md) §8 for the *decisions* (which arrangement, when a control applies); this file gives the *anatomy*.

Source of the design: [`docs/brand/buloo-filter-section-v2.html`](./brand/buloo-filter-section-v2.html) — open it, the demos are interactive.

Two things worth knowing before you change any of it:

- **`FilterTrigger.tsx` is the point of the folder.** Every filter control in the app opens from it, so a design change is one `cn()` call there rather than fifteen toolbars. It is exported publicly so the catalogue's warehouse-scope control — the one control that could not be expressed declaratively — still wears the same shell.
- **The popovers decline Radix's auto-focus** (`onOpenAutoFocus`), because Radix parks focus on the content wrapper, which is the *ancestor* of the listbox's key handler; arrow keys would fire above it and never arrive. `FilterOptionList` takes focus itself.

## Shared trigger

All four filter primitives render the same trigger shell. Specify it once, here.

```
h-10 rounded-md border border-border bg-surface px-3 text-sm inline-flex items-center gap-2
```

| State | Classes |
| --- | --- |
| Default | as above; label `text-muted`, value `font-medium text-foreground` |
| Hover | `border-input-hover` |
| **Has a value** | `bg-navy-100 border-transparent text-primary` — both label and value go navy |
| Open | `border-primary ring-[3px] ring-ring/50`, chevron `rotate-180` |
| Disabled | `opacity-50 pointer-events-none` |

The chevron is lucide `ChevronDown`, `size-3.5 text-muted`, with `transition-transform`.

**Width is derived from content, not hardcoded.** Use `min-w-0 max-w-[240px] truncate`. The current codebase picks `w-36`, `w-40`, `w-44`, `w-48`, `w-52`, `w-56` per call site — that drift is exactly what this kills.

## `FilterBar`

**When:** ≤ 4–5 fields, mostly single-select and search, no multi-select. The default for existing modules.

```ts
interface FilterBarProps {
  children: ReactNode;            // the filter triggers, in priority order
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;         // default "Cari…"
  };
  overflow?: ReactNode;           // rare fields, rendered inside "Filter lain"
  chips?: AppliedFilter[];
  onClearAll?: () => void;
}

interface AppliedFilter { key: string; label: string; onRemove: () => void }
```

Anatomy:

```
<div class="flex flex-wrap items-center gap-2">
  {children}                       ← triggers, each auto-applies
  <FilterOverflow>                 ← "Filter lain" funnel, own Reset + Terapkan
  <div class="ml-auto">            ← search is ALWAYS far right
    <FilterSearch>
<FilterChips>                      ← below the row
```

Search sits far right and apart from the filters — it is a different kind of act. Table-level controls (export, columns) go right of search, never between filters.

## `FilterPanel`

**When:** ≥ 5 fields, **or** any multi-select, radio group, or fields that only make sense together — **or** a quick bar on a viewport too narrow to lay one out. Produk & Varian reaches it the third way, below 600 px.

```ts
interface FilterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;                 // default "Filter"
  children: ReactNode;            // FilterField stack
  onReset: () => void;
  onApply: () => void;
  applyLabel?: string;            // default "Terapkan"
}
```

Anatomy — a sheet from the bottom edge, capped at 560 px and centred past that:

```
<DialogContent class="inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] rounded-t-2xl sm:max-w-140">
  <header class="px-5 pt-5 pb-1">
    <DialogTitle class="text-lg font-bold">Filter</DialogTitle>          ← the dialog's X sits right
  <div class="space-y-4 overflow-y-auto px-5 py-4">{children}</div>
  <footer class="flex gap-2 border-t border-border px-5 py-4">
    <Button variant="secondary" size="lg" class="flex-1">Reset</Button>  ← equal halves
    <Button size="lg" class="flex-1">Terapkan</Button>
```

**Bottom, not centre:** it is reached almost entirely from a phone, where the bottom of the screen is the half a thumb reaches and a centred box puts Terapkan under the keyboard. Reset is a real button rather than the quiet text link it is inside a popover — at this width, a text button beside a filled one reads as a caption.

**One** Reset and **one** Terapkan for the whole panel. Fields inside stay draft until Terapkan; Reset clears *and* re-queries immediately. The panel owns no field state: the caller holds the draft, seeds it on open, and commits it on Terapkan.

`FilterField` is the labeled wrapper: `<label class="mb-1.5 block text-xs font-semibold">` above a full-width control. It renders a plain span rather than a `<label>` unless given `htmlFor`, because most filter controls here are a button that opens a popover.

**One control, two arrangements.** `FilterSelect` (and `FilterTrigger` under it) takes `layout="inline" | "field"`: the bar's `Gudang: Semua ⌄`, or a labeled full-width row for inside a panel. A screen with both renders one list of fields and hands it a layout, rather than keeping two lists in step by hand.

## `FilterSearch`

```ts
interface FilterSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;              // required — the placeholder is not a label
}
```

40 px, `rounded-md`, lucide `Search` at `absolute left-3 size-4 text-muted`, input `pl-9`. Applies live, debounced **300 ms in the calling hook, not in this component** — the component stays controlled and dumb.

## `FilterSelect` — single

```ts
interface FilterSelectProps<T> {
  label: string;                  // "Gudang"
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
  searchable?: boolean;           // default false
  clearable?: boolean;            // default true
  allLabel?: string;              // default "Semua"
}
```

Trigger reads `Gudang: Semua ⌄`. **Not** a native `<select>` — a Radix popover — so `searchable` can put a search box inside the list. Kartu Stok's Produk field needs that; a native select can't.

**Selecting an option applies immediately and closes the popover.** One click, one result.

Options render as a list with a check mark on the selected row (`rounded-full` mark, navy fill when selected).

## `FilterMultiSelect`

```ts
interface FilterMultiSelectProps<T> {
  label: string;
  values: T[];
  options: { value: T; label: string }[];
  onApply: (values: T[]) => void;
  onReset: () => void;
  searchable?: boolean;
}
```

Trigger reads `Kategori (3)` — label plus a count, no value list. Check marks are square (`rounded-[5px]`), not round.

**Selecting does not close the popover, and does not apply.** People tick several boxes before they are ready. The popover therefore always carries its own footer:

```
<footer class="flex items-center justify-between border-t border-border bg-background px-3 py-2.5">
  <button class="text-sm font-semibold text-warning">Reset</button>
  <Button size="sm">Terapkan</Button>
```

Internally it holds a `draft` array, seeded from `values` each time it opens; Terapkan commits, Reset clears and applies at once.

## `FilterDateRange`

```ts
interface FilterDateRangeProps {
  label?: string;                 // default "Tanggal"
  from: string | null;            // ISO yyyy-mm-dd
  to: string | null;
  onApply: (range: { from: string | null; to: string | null }) => void;
  onReset: () => void;
  presets?: DatePreset[];         // default 7 hari / 30 hari / Bulan ini / Kustom
}
```

Popover: a row of preset chips, then `Dari` and `Sampai` date inputs, then the same Reset + Terapkan footer as multi-select. Picking a preset fills both inputs but **does not apply** — "Dari" alone is not a query.

Trigger shows `Tanggal: 1 Ags–14 Ags` when set, `Tanggal: Semua` when not. Month names abbreviated in Indonesian: Jan Feb Mar Apr Mei Jun Jul Ags Sep Okt Nov Des.

Replaces the two free-standing `Tanggal awal` / `Tanggal akhir` inputs currently in `StockCardFilters`.

## `FilterPills`

**When:** one dimension is the page's main lens and has small cardinality — status, urgensi, tipe. Lives **outside** the bar or panel.

```ts
interface FilterPillsProps<T> {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}
```

`h-9 rounded-full border-[1.5px] px-4 text-sm font-semibold`. Unselected: `border-border bg-surface text-muted`, count chip `bg-navy-100 text-primary`. Selected: `bg-primary border-primary text-primary-foreground`, count chip `bg-white/25`.

Always auto-applies. Always shows counts when they are known — the count is why a pill beats a dropdown.

Rendered as a `role="group"` with `aria-pressed` on each pill.

## `FilterChips`

```ts
interface FilterChipsProps {
  items: AppliedFilter[];
  onClearAll?: () => void;        // renders "Hapus semua" when 2+ chips
}
```

`h-7 rounded-full bg-navy-100 pl-3 pr-1.5 text-xs font-semibold text-primary`, with a `size-4 rounded-full` remove button carrying lucide `X`. The button needs `aria-label={`Hapus filter ${label}`}` — an X alone is not a label.

Renders nothing when `items` is empty. Never show a chip for a filter that is at its default.

---

# Page structure

## `PageHeading`

**Promote** `src/features/purchasing/components/PageHeading.tsx` to `src/components/`. It already exists and is already documented; it just never left its feature folder, so ~25 pages hand-roll it in three drifted variants.

```ts
interface PageHeadingProps {
  crumbs: Crumb[];                // ancestors first, current page last, WITHOUT href
  title: string;
  actions?: ReactNode;            // NEW — the right-hand button
  children?: ReactNode;           // one sentence on what the screen is for
}
```

`crumbs` stays **required**. The existing docblock argues this well: a page three levels deep had no way to say where it sat, and the ancestors come ready-made from `features/*/crumbs.ts`.

`actions` is the addition. Its absence is the likeliest reason 25 pages copied the markup instead of importing it — every list page has a "Tambah" button next to the title and the component had nowhere to put it.

```
<div class="flex items-start justify-between gap-4">
  <div>
    <Breadcrumb items={crumbs} />
    <h1 class="mt-1 font-display text-3xl font-extrabold tracking-tight text-foreground">
    <p class="mt-1 max-w-2xl text-sm text-muted">{children}</p>
  {actions && <div class="flex shrink-0 gap-2">{actions}</div>}
```

One heading size across the app. The auth pages' `text-xl` variant goes away.

## `Card`

`src/components/Card.tsx` already exists. The spec's job is to state that the **52 hand-written copies of `rounded-xl border border-border bg-surface` are wrong**, and to add the props that would have prevented them.

```ts
interface CardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;            // header-right
  padding?: "sm" | "md";          // p-4 | p-6, default md
  children: ReactNode;
}
```

`rounded-xl border border-border bg-surface shadow-sm`. Cards sit `gap-8` (32 px) apart. An interactive card adds `transition hover:border-primary hover:shadow-md`.

## `EmptyState`

Normalises three near-identical dashed variants currently in `JournalEntryDetail`, `CustomersTable` and `SectionPlaceholder`.

```ts
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;                  // states the fact
  description?: string;           // offers the next step
  action?: ReactNode;
  variant?: "dashed" | "warm";    // default dashed
}
```

- `dashed` — `rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center`
- `warm` — `bg-orange-100 border-transparent`, for encouraging first-run states rather than "nothing matched your filter"

Copy contract, per [`docs/ui-rules.md`](./ui-rules.md) §12: title states the fact, description offers the next step.

> **Belum ada produk di gudang ini.**
> Tambah produk pertama untuk mulai mencatat stok. → *[Tambah produk]*

Never `"No data available"`. Never a shrug illustration — see the cute line.

---

# Status

## `StatusBadge`

One component replaces 15 feature badges built on three incompatible tinting conventions.

```ts
interface StatusBadgeProps {
  tone: "neutral" | "info" | "success" | "warning" | "danger" | "brand";
  label: string;                  // REQUIRED, and a string
  icon?: LucideIcon;
  title?: string;                 // tooltip for the long form
}
```

`label` is a required `string`, not `ReactNode`. That is how "status is never colour alone" gets enforced by the type system instead of by review.

```
inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
border border-transparent
```

| tone | fill | ink |
| --- | --- | --- |
| `neutral` | `bg-tint-neutral` | `text-muted` |
| `info` | `bg-tint-info` | `text-info` |
| `success` | `bg-tint-success` | `text-success` |
| `warning` | `bg-tint-warning` | `text-warning` |
| `danger` | `bg-tint-danger` | `text-danger` |
| `brand` | `bg-navy-100` | `text-primary` |

**Why this convention won** over `/25` fills and `/40` visible borders:

1. It is already the most-used shape for semantic tones in the codebase.
2. It matches Buloo's own badge recipe — navy-100 fill, navy-700 ink, no border.
3. A visible border on a 13 px pill reads as a *button* affordance. A status is not a button.
4. Borderless keeps badges quiet, which is what protects the 5 % orange budget on a table with 50 rows of them.
5. Named tints survive compositing over a `navy-100` selected row; `bg-success/12` goes muddy.

### Migration map

| Existing | tone |
| --- | --- |
| `users/StatusBadge`, `BranchStatusBadge`, `WarehouseStatusBadge`, `RoleStatusBadge` | active → `success`, inactive → `neutral` |
| `SupplierStatusBadge` | overdue → `danger`, else render nothing (current behaviour is right) |
| `SupplierTypeBadge`, `ProductTypeBadge` | `brand` for the primary type, `neutral` otherwise |
| `CustomerVipBadge`, `TenantSubscriptionBadge` | `warning` — the one sanctioned orange tint |
| `InvoiceStatusBadge`, `PurchaseReturnStatusBadge`, `OpnameStatusBadge` | paid/done → `success`, draft → `neutral`, pending → `info`, overdue/void → `danger` |
| `MovementBadge` | in → `success`, out → `danger`, adjust → `info` |
| `AuditActionBadge` | create → `success`, update → `info`, delete → `danger` |
| `ExpiryBadge` | **keeps its own component** — it computes a countdown — but delegates rendering: `< 0` and `< 7` days → `danger`, `< 30` → `warning`, else `success` |

`ExpiryBadge` is the best visual test in the app: it renders four tones side by side in one column. Check it first after any change here.

---

# Tables

## `ui/table` retune

`src/components/ui/table.tsx` exists and 17 files use it, but its `TableHead` is `text-sm text-foreground` — heavier than the raw `<table>` headers it should be replacing. Retune it **before** migrating the 20 raw-table files, so they don't migrate onto the wrong style.

```
TableHead:  h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted
TableCell:  px-4 py-3 text-sm
TableRow:   border-b border-border transition hover:bg-surface-hover
            data-[selected=true]:bg-navy-100
```

13 px via the retargeted `--text-xs`, which replaces both the raw `text-[10px]` headers and the current `text-sm text-foreground`.

Numeric columns: `text-right tabular-nums` on both head and cell.

Wrap in `<div class="overflow-x-auto rounded-xl border border-border">` so wide tables scroll inside their own container and the page body never scrolls sideways.

---

# Sorting

**Not built, and blocked — read the backend note before starting.**

Sorting does not exist at any layer today: no `*ListQuery` carries it, no service sends it, and no backend list endpoint accepts it. So there is nothing inconsistent to unify here — this is a feature, not a cleanup, and it is specified rather than built for that reason.

## `SortSelect`

```ts
interface SortSelectProps<T extends string> {
  value: { by: T; order: "asc" | "desc" };
  options: { value: T; label: string; defaultOrder?: "asc" | "desc" }[];
  onChange: (value: { by: T; order: "asc" | "desc" }) => void;
}
```

Built on `FilterTrigger`, reading `Urutkan: Nama A–Z ⌄`.

**Direction lives inside the option label** — `Nama A–Z`, `Nama Z–A`, `Terbaru`, `Terlama` — not in a separate arrow toggle beside it. Two controls for one concept is how these toolbars drifted apart in the first place, and "sort by name, descending" is one decision a person makes once, not two they compose.

## The backend has to go first

`middlewares/validate.middleware.js` sets `stripUnknown: true`, and `validations/common.validation.js` defines the shared list contract as `page` + `limit` only. **A frontend that sends `?sortBy=name` before the schema knows the field gets no 400 and no log — Joi silently drops it and the old order comes back.** A control that looks live and changes nothing, with no diagnostic, is the worst failure mode available.

In order:

1. `common.validation.js` — add a `sorting(allowed)` helper returning `{ sortBy: Joi.string().valid(...allowed), sortOrder: Joi.string().valid("asc","desc").default("desc") }`. **Whitelist per resource, never free-form**: then `stripUnknown` turns a typo into a 400 instead of eating it.
2. **Add the compound index before exposing the field** — `{tenantId:1, deletedAt:1, name:1, _id:1}` and the `sku` equivalent. Sorting by name without one is an in-memory sort that MongoDB aborts past 32 MB: a production incident triggered by a dropdown.
3. Repository — `.sort({ [sortBy]: dir, _id: dir })`, **always with the `_id` tiebreaker**. The codebase already understands this (`goodsReceipt.repository.js`, `purchaseInvoice.repository.js`): without it, rows skip across page boundaries on a non-unique key.
4. Frontend — `sortBy` / `sortOrder` on the `*ListQuery` types and in each `*.service.ts` explicit param whitelist (`product.service.ts` is the pattern). The hooks' `setQuery` needs no change: its rule is "anything but `page` resets to page 1", which is already field-agnostic.
5. Pilot on **products, suppliers, customers** — three lists with real find-by-name pressure and a small index surface.

## Lists that must never get a sort control

Recorded so this stays a decision rather than an oversight:

| Resource | Why |
| --- | --- |
| Batch & Expired | The FEFO order (`noExpiry`, `expiryDate`, `createdAt`) **is** the report's meaning. `BatchesTable.tsx` argues it. |
| Kartu Stok | The running `Saldo` column depends on row order; re-sorting makes it a lie. `StockLedgerTable.tsx`: "NEWEST FIRST IS NOT A SORT PREFERENCE." |
| Audit log, Jurnal Umum | A log is chronological by definition. |

`SortableTableHead` is a separate question and is **blocked** until `ui/table` is retuned and the 20 raw-`<table>` files migrate — `ProductsTable` is one of them, so a header-based sort could not land on the flagship list anyway.
