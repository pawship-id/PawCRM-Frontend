# Buloo UI rules

**This file is loaded every session.** If a rule here conflicts with what you were about to write, the rule wins. If it conflicts with existing code, the existing code is wrong and is on the migration list in §15 — match the rule, not the neighbouring file.

Scope: everything under `src/app/**`, `src/features/**`, and `src/components/**`. The brand book that justifies these rules is in [`docs/brand/`](./brand/); it is background reading, not a spec. Building or changing a shared component? Read [`docs/ui-component-specs.md`](./ui-component-specs.md) first.

---

## 1. Non-negotiables

1. **No hex literals in `.tsx`.** Every colour comes from a token. If you need a colour that has no token, add the token to `src/styles/globals.css` — don't inline it.
2. **Orange is a fill, never text.** `#F5921E` is 2.1:1 on white. There is no situation where `text-secondary` is correct.
3. **Every coloured badge carries a word.** Status is never communicated by colour alone.
4. **Visible focus ring on every interactive element.** No `outline-none` without a `focus-visible:` replacement.
5. **Touch targets ≥ 44×44 px.** Icon-only buttons use `size-9` minimum with padding to reach 44 in the hit area.
6. **Reading copy ≥ 14 px; nothing below 13 px, ever.** `text-[10px]` is banned outright.
7. **UI copy is Bahasa Indonesia.** See §12.
8. **At most one emoji anywhere**, and only in a message a pet owner reads — never in the product UI.

---

## 2. Use Y, not X

The fastest way to be consistent here. Check this table before writing markup.

| Instead of writing… | Write | Why |
| --- | --- | --- |
| `bg-card`, `text-muted-foreground`, `text-destructive` | `bg-surface`, `text-muted`, `text-danger` | Identical values. App vocabulary wins outside `components/ui/`. §3 |
| a hand-rolled toolbar `<div>` | `<FilterBar>` + the filter controls, from `@/components` | 15 copies used to exist in two incompatible layouts. §8 |
| `ui/select` for a filter, plus a `const ALL = "all"` sentinel | `<FilterSelect>` with `withAll(…)` / `triState(…)` | The sentinel only existed because Radix Select forbids `value=""`. §8 |
| a `w-40` / `w-44` / `w-52` guess on a filter | nothing — width comes from content | One number, in `FilterTrigger.tsx`. |
| a bare `<input type="date">` pair with an `s/d` between them | `<FilterDateRange>` | It bounds the two ends against each other and holds a draft until Terapkan. |
| `rounded-xl border border-border bg-surface` | `<Card>` from `@/components` | Hand-written 52 times. |
| `Breadcrumb` + `h1` + `p` assembled by hand | `<PageHeading>` | ~25 pages hand-roll it in 3 drifted variants. |
| a new `XxxStatusBadge` in a feature folder | `<StatusBadge tone label>` (spec'd) | 15 exist with 3 incompatible tinting conventions. §9 |
| `Swal.fire(...)` | `swalToast()` from `@/lib/swal` | One themed entry point. §9 |
| `import … from "@/components/icons"` | `lucide-react` | Two icon sets; `icons.tsx` is being retired. §11 |
| `font-mono` on anything | `tabular-nums` | There are two typefaces, and mono is not one of them. §5 |
| a native `<select>` for a filter | a labeled trigger + popover | `Label: Value ⌄`, so long lists can carry in-popover search. §8 |
| `<table>` | `@/components/ui/table` | §10 |
| `"No data available"` | `"Belum ada … Tambah yang pertama →"` | §12 |

---

## 3. Token vocabulary

One name per role. Both vocabularies resolve to identical values, so this is a naming rule with no visual consequence — but drift here is why the codebase reads as two apps.

| Role | Use | Never (outside `components/ui/`) |
| --- | --- | --- |
| Card / input background | `bg-surface` | `bg-card` |
| Secondary text | `text-muted` | `text-muted-foreground` |
| Error text and fills | `text-danger`, `bg-danger` | `text-destructive`, `bg-destructive` |
| Hover / selected background | `bg-surface-hover`, `bg-surface-selected` | `bg-accent` |

**The shadcn names are legal only inside `src/components/ui/**`.** Those files are vendored and must stay re-syncable from the shadcn CLI, so leave their internals alone.

Colour tokens available: `background`, `foreground`, `surface`, `surface-hover`, `surface-selected`, `border`, `muted`, `primary`, `primary-hover`, `primary-foreground`, `secondary`, `secondary-hover`, `secondary-foreground`, `success`, `success-fill`, `warning`, `info`, `danger`, `danger-ink`, `danger-foreground`, plus the raw `navy-*` / `orange-*` / `slate-500` scales and the `tint-*` badge fills.

**Raw scale steps (`navy-700`, `orange-500`, …) are for composing tokens in `globals.css`, not for components.** In a component, reach for the semantic name. The one sanctioned exception is `bg-navy-100` for a selected row, because "selected" has no better semantic name yet.

---

## 4. Colour and the 5 % rule

Navy is the working colour. Orange appears rarely and always means *a human must act*.

**Proportion per screen: ~62 % white/background, ~26 % navy, ~7 % sky (`navy-100`), ~5 % orange.** Orange never exceeds about 5 %. As a background or a header bar it turns the product into a discount flyer, and shop owners stop trusting it with money.

- Orange is `--secondary`. It is a **fill**: badges, small tint panels, the focus ring, one accent in the logo.
- **Orange fills take `text-secondary-foreground` (navy-800) labels, never white.**
- For orange-coloured *text* on a light surface there is `--warning` (`#B96A05`). That is the only orange that may be text.
- If two orange things are visible at once, one of them is wrong.

```tsx
// ✅ a warm badge — orange fill, navy ink
<span className="bg-secondary/25 text-secondary-foreground">Konsinyasi</span>
// ❌ orange as text
<span className="text-secondary">Konsinyasi</span>
// ❌ orange as a full-width surface
<div className="bg-secondary p-6">…</div>
```

---

## 5. Type and numbers

Two families. `font-display` (Plus Jakarta Sans) for headings only; `font-sans` (Inter) is the default and covers body, labels, and **every number**.

**`h1`–`h4` already get `font-display` and tight tracking from the base layer in `globals.css`.** You do not write those two on a heading — write the size and the weight:

| Role | Write | Renders |
| --- | --- | --- |
| Page title | `<h1 class="text-2xl font-extrabold">` | 24 / 800 |
| Section heading | `<h2 class="text-lg font-bold">` | 18 / 700 |
| Card heading | `<h3 class="text-base font-bold">` | 16 / 700 |
| Body / reading copy | *(default)* `text-[15px]` or `text-base` | 15–16 |
| Dense UI, table cells | `text-sm` | 14 |
| Labels, table headers, badges | `text-xs` | 13 |

- Never put `font-display` on body copy. If you need display type on something that isn't a heading element, that is usually a sign it should be a heading element.
- **The heading sizes above are the product scale, not the brand book's.** The book's 56 / 40 / 30 is drawn for the marketing site; a data tool that shows a breadcrumb, a title and a table on one screen does not get a 40 px title. The *typeface, weight and tracking* follow the brand exactly — the sizes are tuned down one step for density.
- **Prices, quantities, dates, times, phone numbers, SKUs and document numbers get `tabular-nums`**, so digits don't jitter as they update and columns stay aligned.
- **There are exactly two typefaces. There is no `font-mono`.** `--font-mono` is deliberately unbound in `globals.css`: a third family is a brand violation, and Inter's tabular figures already do the column-alignment job a monospace face was doing here.
- Nothing below 13 px. `text-[10px]` is banned — it is the single worst offender in the current table headers.

---

## 6. Geometry and motion

Nothing is sharp. The logo is built from circles and round caps; a square corner contradicts it.

| Surface | Class | Renders |
| --- | --- | --- |
| Input, select trigger, badge-with-corners | `rounded-md` | 8 px |
| Button | `rounded-lg` | 12 px |
| Card, table container, panel section | `rounded-xl` | 16 px |
| Filter panel, modal, auth card | `rounded-2xl` | 24 px |
| Pill, chip, avatar, status badge | `rounded-full` | 999 px |

These are **retargeted Tailwind defaults** — `rounded-xl` really is 16 px in this repo. Do not write `rounded-[16px]`.

- **Elevation** is navy-tinted, never grey: `shadow-sm` rows, `shadow-md` cards, `shadow-lg` modals and popovers.
- **Spacing** is the 4 px ladder: `gap-2` inside controls, `p-4` small card, `p-6` card, `gap-8` between cards, `space-y-12` between blocks.
- **Motion**: the default easing and 160 ms duration are already Buloo's — plain `transition` is correct. Panels use `duration-240`. Nothing exceeds 400 ms. `prefers-reduced-motion` is honoured globally in `globals.css`; don't re-implement it.

---

## 7. Buttons and interactive states

| Variant | Looks like | Use for |
| --- | --- | --- |
| `default` | navy fill, white label | the main action on a screen |
| `secondary` | white fill, 1.5 px navy border | Batal, Kembali, Muat ulang |
| `ghost` | text only | dismiss, tertiary actions in a row |
| `destructive` | danger fill | delete and other irreversible actions |

There is deliberately **no orange button variant in the product.** Orange CTA buttons belong to the marketing site, one per viewport.

Heights: `size="sm"` 32, `default` 36, `lg` 40. Use `lg` for a form's primary submit.

**Focus is a pair, not a ring alone.** The orange ring is 2.33:1 on white — on its own it does not meet the 3:1 non-text contrast floor. Every focusable control must change its **border to navy** *and* show the orange halo:

```
focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50
```

This is already baked into `ui/button.tsx`, `ui/input.tsx` and `ui/select.tsx`. Match it on anything hand-rolled.

---

## 8. Filters

One control grammar, two arrangements. Pick the arrangement by counting fields.

| Condition | Arrangement |
| --- | --- |
| ≤ 4–5 fields, mostly single-select and search | **Quick bar** — one horizontal row, each trigger auto-applies, search pinned far right, rare fields behind a "Filter lain" popover |
| ≥ 5 fields, **or** any multi-select, radio group, or interdependent fields | **Filter panel** — 280 px sidebar or wide popover, vertical labeled fields, one global Reset + one global Terapkan |
| One dimension is the page's main lens and has small cardinality (status, urgensi, tipe) | **Pill row**, *outside* the bar or panel, always auto-apply, with counts |

Filter controls are 40 px tall, `rounded-md`, and read `Label: Value ⌄` — a labeled trigger, **not** a native `<select>`, so long option lists can carry a search box inside the popover.

### Reset / Terapkan — the decision table

| Control | Where | Applies | Own Reset + Terapkan |
| --- | --- | --- | --- |
| Single select, standing alone | quick bar | **on click** | no |
| Single select | inside a 2+ field panel | on the panel's Terapkan | no — uses the panel's |
| Multi-select | **anywhere** | on its own Terapkan | **yes**, inside its popover |
| Date range | **anywhere** | on its own Terapkan | **yes**, inside its popover |
| Search input | anywhere | debounced, live | no |
| Pill row | anywhere | **on click** | no |
| 2+ combined fields | a panel | on the panel's Terapkan | **one** global pair |
| **Reset, at any level** | — | **immediately — clears and re-queries in the same click** | never waits for Terapkan |

A panel exists so the table doesn't re-query three times while someone composes a query. A quick bar exists so one click gives one result. Choosing the wrong arrangement is the only way to get this wrong.

**Module mapping:** Produk & Varian (5) → quick bar, the two rare fields behind Filter lain · Batch & Expired (3) → quick bar, urgensi as pills · Kartu Stok (4) → quick bar, Produk select is searchable · Supplier (2) → quick bar, tipe as pills · Sales / Invoice / Booking when built (~8) → filter panel.

**A quick bar is one line, and a phone has no line.** Below ~600 px every trigger collapses into a single `Filter` button opening a `FilterPanel` — the panel arrangement reached by viewport rather than by field count, and the fields inside it wait for Terapkan like any other panel's. Both arrangements are the same controls (`FilterSelect`'s `layout` prop), so render **one** list of fields and hand it a layout. Do not render both and hide one with `hidden md:flex`: two triggers named "Kategori" is one control to look at and two to a screen reader. Branch on `useMediaQuery`, whose fallback is the wide bar so the server never prerenders the collapsed one. Produk & Varian is the worked example.

Applied filters render as removable chips below the bar or panel. Anatomy and props: [`docs/ui-component-specs.md`](./ui-component-specs.md).

---

## 9. Status and feedback

**One badge convention: pale named tint + saturated ink + transparent border.**

```tsx
// ✅
<span className="rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success">Lunas</span>
// ❌ a visible border reads as a button affordance; a status is not a button
<span className="border border-success/40 text-success">Lunas</span>
```

Tones: `neutral`, `info`, `success`, `warning`, `danger`, `brand`. Use the `bg-tint-*` tokens, not opacity arithmetic (`bg-success/12`) — a translucent fill goes muddy when it composites over a selected row.

The badge label is **always a string**, never colour alone and never an icon alone.

### Which feedback surface

| Surface | Use when |
| --- | --- |
| `swalToast()` | it worked; there is nothing to decide |
| `<Alert>` | inline, form-level, stays on screen while the problem persists |
| `<ConfirmDialog>` | destructive or irreversible; needs an explicit yes |
| raw `ui/dialog` | only when the body needs a form |

**`Swal.fire` is banned outside `src/lib/swal.ts`.** No new sweetalert call sites — that module is the single seam through which the toasts get themed, and it is on the migration list to be replaced entirely.

---

## 10. Tables and empty states

**Never write `<table>` directly.** Use `Table, TableHeader, TableRow, TableHead, TableBody, TableCell` from `@/components/ui/table`.

```tsx
// ✅
<TableHead>Pelanggan</TableHead>
// ❌ 10 px is below the 13 px floor, and 20 files already do this — do not make it 21
<th className="px-4 py-2.5 text-[10px] tracking-widest text-muted uppercase">Customer</th>
```

Numeric columns are `text-right tabular-nums`. Row hover is `bg-surface-hover`; a selected row is `bg-navy-100`.

**Empty states** state the fact, then offer the next step. Never a bare `"No data"`:

> **Belum ada produk di gudang ini.**
> Tambah yang pertama →

---

## 11. Icons

`lucide-react` only. `ui/select`, `ui/checkbox` and `ui/dialog` import it internally, so any second icon set guarantees a permanent mismatch.

- Default size `size-4`; `size-5` in page headers.
- Stroke 2 at 24 px — lucide's default. Don't override.
- Never mix outline and filled.
- **Do not import from `@/components/icons`.** That 441-line hand-rolled set is on the migration list; its stroke weight (1.75) contradicts the brand, and it already collides with lucide on `ChevronDownIcon`.

---

## 12. Copy and voice

**Bahasa Indonesia, everywhere in the product UI** — buttons, placeholders, table headers, empty states, toasts, page titles, nav. English survives only in code identifiers, route segments, API fields, docs, and test names.

Talk like a colleague at the counter. Don't lecture. Keep it short — their hands are full. Never blame the user.

| ✅ | ❌ |
| --- | --- |
| Simpan booking | Submit data reservasi |
| Belum ada booking hari ini. Tambah yang pertama → | No data available |
| Nomor WhatsApp-nya kurang satu angka. Coba cek lagi. | Invalid input. Please try again. |
| Tersimpan. Struk sudah dikirim ke WhatsApp Kak Rina. | Transaction completed successfully!! |

**Identifier vs. visible string** — the split you will hit immediately. `InvoiceStatusBadge`, `invoiceId`, `/invoices` stay as they are; the *visible* word is **faktur**. Likewise `user` → **pengguna**, `customer` → **pelanggan**, `supplier` → **supplier** (the trade uses it).

Words we use: kasir · booking · grooming · penitipan · pelanggan · struk · member · supplier · gudang · stok.
Words we don't: POS · reservasi · user · invoice · modul · platform · solusi terintegrasi · revolusioner · UMKM.

**The "any level" rule.** Never describe customers by their size. No "UMKM", no tier language, anywhere in copy. A petshop is a petshop.

**The cute line.** This brand fails in exactly one direction: too cute. No faces on objects, no paw prints as bullets, no diminutives, no mascot. Warmth comes from round shapes and plain language, not decoration. When the choice is between charming and clear, pick clear.

---

## 13. Accessibility floor

- Body text ≥ 14 px, contrast ≥ 4.5:1. Reading copy ≥ 15 px.
- Orange is never a text colour. Use `--warning` `#B96A05` when you need orange-ish text.
- Visible focus ring on every interactive element — and see §7, the ring pairs with a navy border.
- Touch targets ≥ 44×44.
- Status is never colour alone.

**Two tokens deviate from the brand book on purpose** — `--muted` and `--success` are darkened because the book's own swatches miss its own 4.5:1 floor. Rationale in [`docs/brand/README.md`](./brand/README.md).

**Known debt:** `--danger` `#D64545` is 4.38:1 as text — marginally under. Until it is repaid, danger text must be ≥ 14 px, semibold, and always paired with a word or icon. `--danger-ink` (6.37:1) exists for when it is.

---

## 14. Where things live

From [`docs/architecture.md`](./architecture.md), unchanged: a component lives in `src/features/<domain>/components/` until a **second** feature genuinely needs it, then it is promoted to `src/components/`. Don't pre-promote, and don't copy-paste instead of promoting — copy-paste is how the 15 toolbars happened.

`src/components/ui/` is vendored shadcn. Retune variants there when the brand requires it; do not add app logic to those files.

---

## 15. Not yet decided, and the migration list

**Built** — `src/components/filters/`, exported from `@/components`, used by all 15 toolbars: `FilterBar`, `FilterTrigger`, `FilterSearch`, `FilterSelect`, `FilterMultiSelect`, `FilterDateRange`, `FilterToggle`, `FilterPills`, `FilterChips`, `FilterPanel`, `FilterField`, plus the `withAll` / `triState` / `namedOptions` option builders.

**Decided but not yet built** — specs exist in [`docs/ui-component-specs.md`](./ui-component-specs.md). Build them when the work calls for one, don't invent a parallel version: `StatusBadge`, `EmptyState`, and a promoted `PageHeading`.

**Migration list** — existing code that violates these rules. Fix opportunistically when you are already in the file; do not open a sweep without being asked:

- 4 screens with filters written inline rather than in a toolbar — `JournalEntriesScreen`, `ChartOfAccountsScreen`, `StockOnHandScreen`, `ProductDetail` — still carry their own `const ALL = "all"` sentinel and a raw `ui/select`. They were not part of the 15-toolbar census; migrate them to `@/components` filters.
- ~25 hand-rolled page headings → promoted `PageHeading`
- 52 hand-written `rounded-xl border border-border bg-surface` → `<Card>`
- 15 feature status badges with 3 tinting conventions → `StatusBadge`
- 20 files writing raw `<table>` → `ui/table`
- ~58 `text-muted-foreground`, 31 `bg-card`, 13 `text-destructive` outside `components/ui/` → app vocabulary
- 9 files importing `@/components/icons` → lucide, then delete `icons.tsx`
- 49 files reaching sweetalert through `lib/swal.ts` → a tokened toast, then drop the dependency
- English UI strings in customers / users / roles / branches / warehouses → Bahasa

**Open questions — record an answer here, don't guess in code:**

- **Dark mode is prepared, not shipped.** The `.dark` palette is written and the `dark:` variant is pinned to an opt-in class, but nothing sets `.dark` on `<html>` and there is no toggle. Don't build one without being asked.
- **A grep-based rule linter** (`scripts/check-ui-rules.mjs`) would ratchet §1 — hex literals, `text-[10px]`, shadcn tokens outside `ui/`, raw `<table`, `@/components/icons` imports. Not written yet.
