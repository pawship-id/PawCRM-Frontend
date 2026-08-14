# Changelog

All notable changes to the PawCRM frontend.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — The last four MVP gaps in Inventory & Purchasing

Frontend half of backend `0.38.0`. Four acceptance criteria that were never built, all
small, all found by re-auditing the PRD against the code rather than against memory.

### A supplier can be told WHICH of their goods are here

PCR-015 asks for "produk yang di-titip + qty remaining". The supplier screen showed
`productCount: 3` — a number a vendor cannot act on. They phone to ask which items to
collect, restock or write off.

`ConsignmentProductsTable` lists them, and is **shared by two screens**: the supplier
detail passes a `supplierId`, the consignment report drills in without leaving the page.
A table per screen would be two ideas of "still on the shelf" that disagree the first
time either changes. It lives in `features/purchasing` because consigned stock is a
vendor relationship; reports borrows it.

A null `nearestExpiry` renders as an em dash, never a date — for dry goods that is the
ordinary case, and "does not expire" versus "expires today" are opposite conversations.

### The stock card is reachable from the product you are looking at

PCR-010 asks for the movement history on the product detail. The screen existed; nothing
linked to it, so the user re-picked the warehouse and product they were already looking at.

Each per-warehouse row now carries a link with **both ids**, and `StockCardScreen` seeds
its first filters from `?productId=&warehouseId=`. Absent params leave the old
first-of-each behaviour exactly as it was.

> **`useSearchParams` needs a `Suspense` boundary or `next build` fails** — and the failure
> hides: in development every route renders on demand, so it never suspends and this works
> perfectly right up until the production build. The page wraps the screen; the plan
> flagged this as a risk to verify and it was real.

The link is withheld on a `parent` and a `bundle`: neither owns a ledger, so it would open
an empty stock card and read as a bug rather than as a property of the type.

### The dashboard shows the two alerts PCR-013 and PCR-018 put there

Both cards worked — on the inventory hub, one click further in than the screen somebody
opens every morning. The dashboard itself still showed four tiles reading "—" and "No data
yet".

Restock and expiry now carry real counts, each gated on the grant its own endpoint
enforces, and **a role without the grant makes no request at all** — not a request that
403s. Zero is rendered as a real, reassuring answer rather than hiding the tile. A failure
is never rendered as zero: a zero that is really an error is the most dangerous number a
landing page can show, because nobody goes and looks.

The two tiles with no data source (bookings, POS sales) are badged **Segera** with the
reason, the same treatment the Sales card gets on the reports hub. A dash reads as a
number that failed to load.

### Stock opname can be exported

PCR-014's "riwayat opname bisa dilihat + export Excel". Two exports, because the AC is
ambiguous and only one of them is what an accountant reconciles:

- **the history**, from the list — one row per counting session, page-scoped and labelled;
- **the lines**, from a sheet — one row per product, which is how a variance is actually
  investigated.

The per-sheet export sits **outside** the draft-only action block: a submitted sheet is the
one that gets reconciled, and it is exactly the state with no other actions on screen.
Uncounted lines are kept and marked, because "we did not get to it" is a finding.

Signs are preserved and typed as numbers on both. A shrinkage is negative in the ledger and
must be negative in the file, or the column cannot be summed to "what did counting cost us
this quarter".

---

## [Unreleased] — Reports has a hub, three screens, and one honest gap

Frontend half of backend `0.37.0`. See `docs/features/reports.md`.

`/dashboard/reports` was a placeholder. It is now a hub of seven cards: three lead
to screens built here, three lead to screens that already existed, and one is
disabled with the reason on it.

### Half of them are links, and that is the design

The stock card, the batch list and the opname history are complete screens with
their own filters and exports. Building "report" versions would have been the
fastest possible way to end up with two screens that answer the same question and
slowly stop agreeing. Reports is a table of contents for them, plus the three that
had no home: **Stok per Cabang**, **Stok Minim**, **Konsinyasi Outstanding**.

### Permissions are per card, not per page

The hub carries no `RequirePermission` — each card names the grant its own
destination enforces (`products:read`, `stockMovements:read`,
`productBatches:read`). Gating the page on one feature would either hide it from
people who can read half of it, or show a page whose links all lead to 403s. A
role holding nothing gets a sentence rather than an empty grid.

### The sales card is shown and disabled

There is no POS and no invoice, so there is no sales data. The card renders greyed
and badged **Segera** with the reason on it. A hidden card leaves an owner
wondering whether the feature exists; a dead one says what blocks it.

### Stok per Cabang computes almost nothing

`totals` covers the entire filtered set and is rendered as it arrives — summing
the page would produce a figure that changes as you page, looks like an answer and
is not one. A caption says which set the tiles count, because three big numbers
above a paged table are otherwise read as its sum. Per-branch subtotals are
labelled "subtotal halaman ini".

A warehouse with no branch groups under **"Tanpa cabang"** rather than
disappearing: `defaultBranchId` is nullable by design, and forgotten stock in a
location nobody visits is exactly what the report is for.

A missing cost basis renders as an em dash, never `Rp 0`.

### Export is `.xlsx` everywhere, through one writer

`utils/xlsx.ts` is the only place that writes a workbook. Columns are typed — a
quantity is a number the reader can sum, a date is a date they can sort, and a SKU
of digits keeps its leading zero because **text is the default**.

Two routes in: big exports (Stok per Cabang, Kartu Stok) take the server's
streaming CSV and re-type it by **header name, never by position**; small ones
build from rows already in memory. The big ones do not page the JSON endpoint —
`limit` caps at 100, so a six-thousand-row catalogue would be sixty round trips.

**The stock card's button now saves `.xlsx`; its endpoint is unchanged.** `Waktu`
is deliberately not typed as a date — the server writes a full ISO timestamp and
the date type reads only the date half, so typing it would throw the time away,
and a stock card read to settle a dispute is where the time matters.

### `utils/csv.ts`

The CSV scanner moved out of the inventory feature, which is now the second thing
that reads CSV. `sheet.ts` re-exports it so the import parser and the exports
cannot drift into different ideas of what a quoted field is.

### Two things the test run taught us

**Mock the workbook writer in screen suites.** Loading the real 500 KB SheetJS
build in every suite that merely offers an export button slowed the parallel run
from 29s to 97s and timed out **seventeen tests in unrelated suites**. What a
screen owns is the hand-off — which rows, through which endpoint, with which
column types — and `xlsx.test.ts` owns the bytes.

**`testTimeout` is now 15s, against Jest's default 5.** Not a workaround for a slow
test: a guard against the result depending on how busy the machine is.
`ProductForm.test.tsx` is 44 `userEvent` tests and ~27 seconds, and its longest
case sat close enough to five seconds that adding suites elsewhere pushed it over —
a failure that says nothing about the code under test. A ceiling still worth
having, so a genuinely hung test fails rather than running until CI is killed.

---

## [Unreleased] — A spreadsheet is a way into the catalogue

Frontend half of backend `0.36.0`. See `docs/features/product-import.md`.

A tenant's first day is four hundred SKUs in a file somebody already maintains, and
the only door into PawCRM was a form that takes them one at a time. **Inventory →
Produk → Import** is the second door: download a template, fill it in, upload it,
see every problem at once, create the lot. Standalone products and variant families;
bundles still go through the form.

### Both `.xlsx` and `.csv`, through one set of rules

CSV is parsed here; `.xlsx` goes through SheetJS. Both meet at `parseGrid`, so every
decision about columns, row numbers and blank cells is written once and cannot come
out differently depending on which button the user pressed in Save As.

**The SheetJS build is not the one on npm, and that distinction is load-bearing.**
`xlsx` on the npm registry is an abandoned artefact frozen at **0.18.5** with a live
prototype-pollution advisory; the maintained line moved to `cdn.sheetjs.com`, which
is what package.json pins:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

The lockfile records an integrity hash, so `npm ci` verifies it like any other
dependency, and `npm audit` reports nothing for it. Anyone tempted to tidy the
unusual URL by installing from npm would be reintroducing a known hole into a parser
that runs over a file the tenant was handed by a supplier. The real cost is an
install that needs `cdn.sheetjs.com` reachable — worth knowing before a cold CI
finds out.

Loaded through a **dynamic import**, so the ~800 KB parser is fetched only by the
user who picked a workbook. A chunk that never loads falls back to "save as CSV",
which needs nothing but the code already running.

### `.xlsx` is the better format here, and the reason is dates

Excel stores a date as a serial number — `2027-08-01` is 46600 — so the workbook
knows which part is the month, and the DD/MM ambiguity that forces the CSV reader to
refuse `01/08/2027` does not arise at all.

The serial is rendered with `SSF.format`, **arithmetic on the serial that never
builds a `Date`**. Every route through a JS Date is a route through the runtime's
timezone, and a user in Jakarta entering the 1st would otherwise have a fair chance
of storing the 31st.

Numbers use the raw value, never the displayed one: `cell.w` for a currency-formatted
price is `Rp45.000,00`, which the decimal reader would refuse — a user rejected for
formatting their own spreadsheet.

### Two template downloads, behind one button

"Unduh template" opens a menu with `.xlsx` and `.csv`, the first marked *disarankan*
with its reason on the line beneath. Two equal-looking buttons would have left the
user choosing on the strength of a file extension, and the choice is not cosmetic.

The server serves CSV and only CSV — one endpoint, one place the column list lives.
The `.xlsx` is built in the browser from it (`utils/templateWorkbook.ts`), so a
column added server-side appears in both downloads with no frontend change.

It is the recommended one because it **cannot silently corrupt a barcode**. A CSV
carries no column format, and `0123456789012` typed into a General column is a
number: Excel drops the leading zero and renders 13 digits as `8.9927E+12`, both
before any code of ours runs. The template formats `barcode`, `sku`, `parent_sku`,
`kode_batch` and every `attr_*` column as Text, and `tgl_expired` as a real date
column. Prices stay numeric so they can still be summed.

**200 empty rows are pre-formatted**, and that is what makes it real rather than a
property of the two example rows — Excel formats the cell being typed into, not the
column as a concept, so a barcode entered on row 40 of an unformatted sheet is a
number again.

`cellStyles: true` on the write is the one flag whose absence would make the whole
file pointless while still producing a valid workbook, which is why the tests read
the formats back and round-trip a leading-zero barcode through download-then-upload
rather than asserting the blob is non-empty.

### Two things found while testing the workbook path

**SheetJS does not reject garbage.** Handed bytes that are not a workbook, 0.20.3
returns a sheet made of nonsense instead of throwing — so the `catch` around
`XLSX.read` is not what protects the wrong-file case. The required-column check is,
and its message is the more useful one anyway. Written down in the code and in the
test rather than left as a guard that looks like it fires and does not.

**The grid is aligned to Excel's gutter**, not to the sheet's used range. A workbook
whose data begins at A3 would otherwise report every row number two off, and the row
number is the one thing the user navigates by. `parseGrid` now finds the header
wherever it sits, which fixes the same class of problem for CSV.

### The parser handles what spreadsheets actually emit

**Semicolons**, first and most importantly: Excel writes CSV with the system list
separator, and on an Indonesian locale that is `;`. Parsed as commas the whole file
is one column, every header is unknown, and the error names a column the user can see
perfectly well in front of them. Sniffed from the header line.

Then quoted fields containing the delimiter, doubled quotes, embedded newlines, CRLF,
a BOM, and grouped thousands (`1.250.000`) — all of which turn up, none of which
`split(",")` survives.

### Two things it refuses to guess

**Dates.** Only `YYYY-MM-DD`. `01/08/2027` is the 1st of August in Jakarta and the
8th of January in New York, and the cell decides when a batch of cat food comes off
the shelf. The refusal names the format *and* says to set the Excel column to Teks,
because that is the actual fix and nobody guesses it.

**Prices with currency on them.** `Rp 45.000,-` is refused rather than repaired —
stripping the decoration would be inventing the number every invoice is built from.

### An unknown column is named, never dropped

A silently-ignored `hpp_awl` is how a catalogue is imported with no cost basis: every
row passes, the products are created, and the balance sheet is wrong in a way nobody
looks for.

### The screen decides nothing about the data

Whether a SKU is free, whether a category exists, whether a family agrees with
itself — answered once, server-side, and rendered here. `canCommit` comes from the
preview and is passed through untouched.

The exception is cell FORMAT, and the reason is worth stating: a cell that is not a
number, not a date and not a known unit is refused by Joi as a **request-level 400
that names no row**. One bad cell in five hundred would come back as "Validation
failed" and send the user through the file by hand. So three format rules are
duplicated — and the duplication is one-way: **a local problem can only make the
commit button more disabled, never less**, because a cell the parser could not read
was never sent and the server's verdict for that row is uninformed.

A refused commit **clears the preview**: the catalogue moved between the two screens,
so the green rows are the stale reading that let the commit be attempted.

### The report is a report, not a success screen

Two outcomes a green tick would hide, and both are real:

- **`failed[]`** — something raced the import. The panel says the rest is already in,
  because the instinct is to re-run the whole file.
- **`openingStockPosted: false`** — the product exists and its stock does not. The
  backend deliberately does not fail a create when the ledger refuses the opening
  balance. Re-importing is never the fix: the SKU now exists and comes back as
  `conflict`.

Three outcomes, not two. Treating the last as a kind of failure rendered a run where
nothing failed as *"selesai sebagian … 0 gagal"* — a sentence that contradicts itself
and points at a failure that never happened.

The commonest cause is `Chart of accounts is missing account 3101`, on a tenant that
predates the COA module (`node src/seeds/backfillAccounts.js` adds it). The panel
then names the **chart of accounts** ahead of the adjustment screen and says why: a
manual adjustment credits 4901 Pendapatan Lain-lain, booking the goods as a *gain* —
right for stock found in a count, wrong for stock the owner already had, which is
capital against 3101. The obvious repair would have filed a tenant's entire starting
inventory as profit.

Messages in an `Alert` are now wrapped in a single `<p>`: `AlertDescription` is a
`grid gap-1`, so every element child became its own row and a bare `<strong>` broke
the sentence across lines.

### Also

- **`types/productImport.ts`** is its own file: a product and a lot are documents, a
  row and a verdict live for the length of one upload.
- **The commit's timeout is 180s**, against 60s for the preview. Five hundred products
  is a minute of sequential transactions, and a client that gives up at fifteen
  seconds abandons an import that is still running — leaving the user with no report
  of what was, by then, already created.
- **The step is derived from the data**, never stored. A `step` variable alongside
  `sheet` / `preview` / `result` is a fourth thing that can disagree with the other
  three.
- **`tests/sheet.test.ts`** (48) is mostly about readings the parser must NOT invent.
  The workbook cases round-trip through a real SheetJS-built `.xlsx` rather than a
  mock: that the code calls SheetJS is not in doubt, what it hands back for a date, a
  currency-formatted price and a boolean is. **`tests/templateWorkbook.test.ts`** (14)
  reads the produced formats back and proves a leading-zero barcode survives
  download-then-upload. **`tests/ImportScreen.test.tsx`** (20) covers the gate, the
  merge and the two partial outcomes.

---

## [Unreleased] — Uploads are compressed before they leave the browser

Frontend half of backend `0.35.0`. See `docs/features/product-management.md`.

### Images are downscaled before upload

`ImageCropDialog` encoded the crop at its full natural resolution, so a 4000×3000 photo off a
phone became a multi-megabyte upload — often above the 5 MB ceiling, which meant the most ordinary
thing a user can do was rejected outright. It now downscales to 2048px through the new
`src/utils/media.ts`, and prefers WebP with a JPEG fallback.

**2048 and not 1600**, which is what the server stores. A canvas `drawImage` downscale is a crude
filter; leaving the last resampling step to sharp gives a sharper stored image than sending
exactly the target size. The headroom is the point.

### Videos send a poster frame, and oversized ones are refused up front

`mediaService.upload` has always accepted a `poster` option and nothing ever passed one, so
`posterUrl` was null on every video and the gallery tile was a blank rectangle. `MediaGallery` now
captures a frame — seeking past the opening second, because video opens on black more often than
not — and sends it.

Best-effort throughout: the server extracts a frame when none arrives, so a browser that cannot
decode one is not an error. `captureVideoPoster` and `probeVideo` both time out after ten seconds,
because a media element is permitted to fire neither `loadedmetadata` nor `error` and the upload
awaits them.

A file over 50 MB is now refused before the upload starts rather than after it. Checked for videos
only: an image is downscaled before it is sent, so the size the user picked says nothing about
whether it will be accepted.

### The tile says "Memproses…" instead of freezing at 100%

The transfer finishing is not the upload finishing — the server still has three image encodes or a
video transcode to run, which on a long clip is tens of seconds. A percentage stuck at 100 reads
as a hung request, and a user who concludes that starts the upload again.

### `mediumUrl` on `ProductMedia`

The product detail grid drew the 320px thumbnail into a tile a few hundred pixels wide, visibly
soft on a 2× screen. It now uses the new 800px derivative, narrowing
`mediumUrl ?? thumbUrl ?? posterUrl ?? url` so media stored before it still renders. The
catalogue table keeps the 320 — right for a 40px row — with the 800 as its fallback instead of the
full-size image.

---

## [Unreleased] — Products become publishable

Branch: `feature/product-expansion` (phases 3–7). Frontend half of backend `0.33.0`.

**The product form now covers what a marketplace listing needs**: merk, a rich-text description
with embedded images, a pre-order flag, shipping parameters, a media gallery, and the sales
account and business line a future POS will post against. See
`docs/features/product-management.md`.

### The one rule this feature turns on

**Inputs bind to the STORED value; the parent's value is a PLACEHOLDER.**

A variant that sets no weight of its own renders an EMPTY weight input showing its parent's number
as placeholder text. Binding the resolved value as the input's value would mean the next save
writes it as this variant's own override — so the variant silently stops following its family on a
save the user thought changed something else. The API returns the two separately (`shipping.weight`
stored, `resolved.shipping.weight` effective) precisely so this is expressible, and `buildPatch`
diffs against the stored one for the same reason.

Clearing a field is how an override is REMOVED and inheritance resumes. There is no reset button
to find.

### The variant matrix is now two-tier

The five columns a person fills for every row — Varian, SKU, Barcode, Harga, Min stok — stay
exactly as they were. Added: a 32px image cell at the front that IS the upload control, and a
chevron that expands an inline row holding that variant's shipping overrides.

**Expanded in place rather than in a dialog**, because the user is comparing rows — *"the 10 kg
should be heavier than the 3 kg"* — and a modal hides exactly the comparison they opened it to
make. Twelve columns would have made the table unusable; a drawer keeps the common path unchanged.

### New components

- `MediaGallery` — up to 9 tiles, crop-before-upload, delete, and reorder by **native HTML5 drag
  plus ◀ ▶ buttons**. The buttons are not a fallback bolted on: they are the touch path, the
  keyboard path, and the only path testable in jsdom (which has no `DataTransfer`). That
  combination is why no drag-and-drop library was added for nine one-dimensional items.
- `ImageCropDialog` — `react-easy-crop`, the one library here that earns its bytes (~12 KB):
  pinch-zoom and aspect-locked cropping over a rotated image is 400 lines of pointer maths users
  notice immediately when it is wrong.
- `RichTextEditor` / `RichTextView` — Tiptap, loaded via `next/dynamic({ ssr: false })` because
  ProseMirror touches `document` while constructing. The read-only view renders through Tiptap
  rather than `dangerouslySetInnerHTML`: the server already sanitises what is stored, so this is a
  second independent barrier for free.
- `ShippingFieldsCard` — one card serves parent, standalone and bundle; an `inherited` prop turns
  every empty input into a window onto the parent's value.

### New services

`chartOfAccounts.service.ts` and `businessLine.service.ts` are **the first real consumers of those
endpoints**. Both clamp their page size to the API's cap of 100 — the first version asked for 200,
which is a `400` rather than a bigger page, so the accounting section failed for **every** user
while the UI reported it as a missing permission. `src/tests/lookupServices.test.ts` now asserts
the queries these services send by mocking `apiClient` rather than the services themselves; the
form's own tests mock the service, so they could only ever have proved what the mock was told to
do.

The failure message no longer diagnoses. `403` is reported as a permissions problem; anything else
is reported as what it actually was — the accounting screens still run on `features/accounting/data/dummy.ts`. Expect
`types/accounting.ts` to need correcting the first time something disagrees with the API.

`media.service.ts` deliberately does NOT go through `apiClient`, and says why in its header: the
wrapper has a hard 15-second timeout (a 50 MB video takes ~80 s) and `fetch` cannot report upload
progress. It uses `XMLHttpRequest` in that one file and still throws `ApiError`, so callers cannot
tell.

`useCatalogLookups` gains an opt-in `withAccounting` flag. The two accounting lists **catch their
own failures**: `chartOfAccounts:read` is a separate permission from `products:read`, and a role
that manages the catalogue without seeing the books is an ordinary arrangement — letting that
rejection reach the shared handler would take down the whole form over an optional section.

### Elsewhere

- Catalogue rows show a resolved thumbnail, the brand, and a pre-order marker.
- The detail screen gains Foto & video, Deskripsi, Informasi pengiriman and Akuntansi cards, each
  inherited value flagged *"warisan dari induk"* — the two states look identical otherwise, and
  they lead to different actions (edit here, or edit the parent and move every sibling).
- `MovementBadge` and `StockLedgerTable` label the `opening_balance` movement type.

### Files

- New: `src/components/{MediaGallery,ImageCropDialog,RichTextEditor}.tsx`,
  `src/services/{media,chartOfAccounts,businessLine}.service.ts`,
  `src/features/inventory/components/ShippingFieldsCard.tsx`, `src/tests/MediaGallery.test.tsx`
- Changed: `ProductForm.tsx`, `ProductDetail.tsx`, `ProductsTable.tsx`, `useCatalogLookups.ts`,
  `types/inventory.ts`, `MovementBadge.tsx`, `StockLedgerTable.tsx`
- New deps: `react-easy-crop`, `@tiptap/{react,starter-kit,extension-image,extension-link,pm}`

---

## [Unreleased] — Opening stock now demands its purchase price

Branch: `feature/product-expansion` (phase 2 of the product feature expansion). Frontend half
of backend `0.32.0`.

**`Harga beli per unit` is now required wherever an opening quantity is entered** — in the
standalone card and per row in the family table. Validated in `ProductForm`'s `validate()`
rather than left to the API, because the API's refusal changed shape: a missing price is now a
`400` raised *before any document is written*, so an unpriced variant row would cost the user
the whole form rather than one cell.

The reason is accounting. The price is the figure the opening inventory journal is built from
(**Dr 1201 Persediaan / Cr 3101 Modal**). Without it the movement carries a quantity with no
value, the journal line is skipped, and the tenant ends up holding stock the balance sheet says
is worth nothing. `0` is accepted and says so in the hint — donated stock and free samples are
real.

The field's placeholder changed from `opsional` to a figure, and its hint from *"Kosongkan kalau
belum tahu"* to what the number actually does. A variant row left with no quantity still asks for
no price.

`OpeningStockInput.costPerUnit` lost its `?` in `types/inventory.ts`, which is what surfaced
every call site; `openingStockFor()` now always sends it rather than spreading it in
conditionally.

### Files

- `src/features/inventory/components/ProductForm.tsx` — `validate()`, `openingStockFor()`, the
  two inputs and the new per-row error line
- `src/types/inventory.ts` — `OpeningStockInput.costPerUnit` required
- `src/tests/ProductForm.test.tsx` — three new cases (standalone refusal, per-row refusal, zero
  accepted); two existing cases now supply a price
- `docs/features/product-management.md`

---

## [Unreleased] — Retur ke Supplier on the API

Branch: `feature/inventory-purchasing`.

**The return screens now run against `/api/purchase-returns`.** They were the last of the
purchasing module still on the prototype store, and the worst place for it to remain: the old
form simulated the weighted-average reversal in the browser and posted a return irreversibly
from the create screen, in one step, with no confirmation. The number it was simulating is the
cost basis of every unit still on the shelf. See `docs/features/purchase-returns.md`.

**A return now has a life before it posts**, matching the workflow the API has always
exposed. `/returns/new` creates a **draft** and moves nothing; the new `/returns/[id]` is
where it is edited, previewed and submitted. The preview comes from
`POST /:id/preview` — the endpoint that runs the submit's own code with the commit left off —
so the HPP arithmetic on screen is the arithmetic that will be written, not a second
implementation of it that drifts silently.

**The list grew filters, pagination, status and row actions**, replacing a table that showed
every demo row unsorted with no way to narrow it. A draft can be discarded from the list; a
submitted return cannot, because the API refuses to discard one and the control should not
exist where the request would fail.

**Consignment deliveries are returnable now.** The old form filtered the picker to
`beli_putus` and was *stricter than the API*: consignment goods can be sent back, the stock
leaves and the average is reversed identically, and only the journal entry is skipped because
the goods were never bought. The form offers both and labels the difference.

**`reason` is free text again.** The prototype's four-value enum could not express "rusak saat
transit, kardus basah"; the API stores a 255-character string per line precisely because the
supplier reads it. The editor offers the four as presets plus "Tulis sendiri…".

### Permissions: three actions that could not be granted

`features/permissions/types.ts` had `purchaseReturns: ["create", "read"]` against a backend
catalog of `["create", "read", "update", "delete", "submit"]`. A tenant literally could not
authorise anybody to submit a return from the Role screen. Fixed.

`submit` is separate from `update` for the usual reason — the seeded **Staff** role gets
create/read/update and not submit, so the person who identifies a bad delivery is not the one
who decides the vendor owes less for it. Because `POST /:id/preview` is gated on `submit`
rather than `read`, a Staff user gets a 403 there while the rest of the page works;
`useReturnPreview` separates that case from an error and the screen renders it as a panel they
do not get, never as a banner over a working page.

**All three routes are guarded.** `/returns` had no `RequirePermission` at all — the nav hid
the entry, but direct URL entry rendered the tenant's returns to any signed-in role.

### A mislabelled journal, fixed at the root

`ReceiptPreviewJournal` is **deleted**. It existed to map the receipt preview's bare
`accountId`s onto account names, and it decided which line was which by testing
`line.credit !== null` — but that endpoint has always sent `credit: "0"` for a debit line,
never `null`. Every line matched the credit branch, so the panel labelled all three rows of a
purchase **"2101 Utang Supplier"**, on the one screen where the entry matters most.

Both purchasing previews now return `accountCode` and `accountName` per line (backend
`0.29.1`), so `ReceiptForm` and the new `ReturnPreviewPanel` pass them straight to the shared
`JournalPreview` and nothing guesses. `ReceiptJournalLine` documents the remaining trap: both
`debit` and `credit` are always present on these two endpoints, one of them `"0"` — read the
amount, never the null.

### Other changes riding along

- **The receipt detail shows what has already gone back.** A new **Diretur** column reads
  `returnedQty` / `remainingQty` from `GET /goods-receipts/:id` (backend `0.29.1`), and the
  existing "this delivery already has returns" notice now links to each of them — "check
  before raising another" is only actionable if the reader can get to the one already there.
- **`PurchaseReturnListRow.notes` removed.** The collection has never had the field, so it was
  always `undefined` at runtime. A return explains itself per line, in `items[].reason`.
- **The purchasing hub's return count comes from the API**, read off `pagination.total` with
  `limit: 1` rather than by counting a page — `.length` on a page silently caps at the page
  size and would report "20 retur" forever.
- **`tests/PurchasingScreens.test.tsx` deleted.** It was the last purchasing suite seeding
  `demoStore`, and returns were the only thing left in it. Replaced by
  `PurchaseReturnScreens.test.tsx` and `purchaseReturn.service.test.ts`.

---

## [Unreleased] — Utang Supplier on the API, and three gaps closed behind it

Branch: `feature/inventory-purchasing`.

**The payables screens now run against `/api/purchase-invoices`.** They were the last of the
purchasing module's core flows computing their answers in the browser: the list derived every
invoice's outstanding balance, decided for itself which were overdue, and summed a running
total across whatever rows it happened to be holding. All three are now the server's —
`outstandingAmount` and `isOverdue` arrive per row against one instant per page, and the
headline figures come from `GET /purchase-invoices/outstanding`, summed in the database over
the whole book. See `docs/features/supplier-payables.md`.

**A new screen: filing the supplier's bill.** `/dashboard/purchasing/payables/new` wraps
`POST /purchase-invoices`, reachable from the payables toolbar or deep-linked from a receipt
with `?receipt=<id>`. The amounts are copied from the delivery and shown read-only: they must
reconcile to the minor unit or the API refuses the request, so an editable box could only
hold the same numbers or cause a 400.

**Both new routes are guarded, and the two existing ones now are too.** `/payables` and
`/payables/[id]` had no `RequirePermission` at all — the nav hid the entry, but direct URL
entry rendered a tenant's supplier debt to any signed-in role. The payment form gates
separately on `purchaseInvoices:pay`, which is the separation of duties the backend enforces:
filing a bill is data entry, paying one moves cash irreversibly.

### Three backend gaps closed, because the frontend could not be correct without them

- **`dateTo` silently dropped a day.** `purchaseInvoice.repository.js` documented that the
  validation layer pushed the bound to end-of-day; nothing did. `dateTo=2026-08-07` arrived
  as midnight, so every bill issued on the 7th fell outside the range — and the list still
  rendered, just missing the newest rows. The coercion now lives in `common.validation.js` as
  `inclusiveDateTo`, so the next module to need it does not have to remember.
- **The overdue rupiah figure did not exist.** `?overdue=true` answers *how many* through
  `pagination.total` and nothing more, so "N faktur lewat jatuh tempo — total Rp X" could
  only be assembled by paging the entire overdue book. `/outstanding` now carries
  `overdueInvoiceCount` / `overdueOutstanding` per supplier and in the grand totals, summed
  in the same `$group` against the same `now` — so the banner cannot claim more is late than
  is owed.
- **Unbilled deliveries could not be filtered for.** `GET /goods-receipts` gained
  `?invoiced=`, a tri-state. Without it the file-a-bill picker had to filter a page on
  `invoiceId === null`, which discards rows the server already counted — page 2 of "belum
  difakturkan" comes back empty while unbilled deliveries sit on page 3.

**A permission-catalog drift, fixed.** The frontend declared
`purchaseInvoices: ["read", "update", "pay"]`. There is no `PATCH` route for `update` to
gate, and the missing `create` hid the file-a-bill button from exactly the roles that hold
the grant. Now `["create", "read", "pay"]`, matching the backend catalog.

**`features/purchasing/payables.ts` deleted.** Its `isOverdue`, `isDueWithin` and
`outstandingTotal` helpers existed to derive in the browser what the API now sends. Keeping
them would have kept a second definition of "overdue" around to drift from the server's.

### Known gap, not closed here

**Reversing a payment's journal entry corrects the ledger, not the invoice.** Nothing on the
backend restores `paidAmount` or `status`, so a bill whose payment was reversed still reads
as paid. `PaymentHistory` shows each payment's `journalEntryId` and says exactly this, rather
than offering a "batalkan pembayaran" action that would not do what its label claims. Closing
the loop needs a backend void/reversal hook — a new feature, deliberately out of this change.

---

## [Unreleased] — Penerimaan Barang on the API, and a module with no edit button

Branch: `feature/inventory-purchasing`.

**The goods-receipt screens now run against `/api/goods-receipts`.** They were the last of
the purchasing module's core flows still computing their answers in the browser: the create
form ran its own sequential weighted-average simulation across its lines, built its own
journal, and invented an invoice number — all reimplemented from the service, and all
authoritative-looking. The list and the detail read a client-side prototype store. Every one
of those numbers is now the server's, fetched from `POST /goods-receipts/preview` — the
posting path with the commit left off — so what a clerk approves before saving is what
actually gets written. See `docs/features/goods-receipts.md`.

**Create and read. There is no update and no delete, and that is the feature.** The backend
exposes no `PATCH` and no `DELETE` for a receipt, because it posts stock movements and a
journal entry that are both immutable and sets the cost basis every later sale is costed at.
The frontend does not paper over the absence: no edit route, no row actions, no
`ConfirmDialog`, and both screens say in plain Indonesian that correction happens through a
purchase return. The `includeDeleted` query flag the endpoint validates is **not** sent and
has no toggle — with no delete route it can never change a result, and a control that cannot
alter its data is worse than an absent one.

**`invoiceId` is not the debt, and the copy finally says so.** A `beli_putus` receipt credits
`2101 Utang Supplier` the moment it posts; `invoiceId` stays null until the supplier's own
bill is filed separately. The old prototype told users the opposite — that the receipt
"created the invoice automatically" — which is exactly backwards about when money starts
being owed. The detail now reads _"Utang sudah tercatat, faktur supplier belum difilekan"_,
and the list distinguishes `belum difakturkan` from a consignment's `tanpa faktur`.

**Three backend gaps are worked around rather than hidden**, each documented where it lives:
the create endpoint is not idempotent (mitigated by a submit lock and `router.replace`, not
solved — a double submit still creates two deliveries); the preview's journal lines carry
`accountId` but no `accountCode`/`accountName` unlike their stock-movement sibling, so
`ReceiptPreviewJournal` maps them onto `1201`/`1301`/`2101` by role; and `GET /:id` resolves
product labels but stops at `batchId`, so lot codes and expiry dates are fetched one at a
time. All three are listed in the feature doc with what would delete the workaround.

### Added

- **`features/purchasing/hooks/useGoodsReceipts.ts`** — the list query (page, search,
  supplier, warehouse, purchase type, `receiptDate` range). Mirrors `useSuppliers`; any
  filter change resets to page 1. No `includeDeleted`, and no mutation for `refetch` to
  follow, because no row here can be acted on.
- **`features/purchasing/hooks/useGoodsReceipt.ts`** — one document, with `notFound` as its
  own state separate from `error`. A 404 offers the way back to the list; a transport
  failure offers a retry.
- **`features/purchasing/hooks/useReceiptPreview.ts`** — debounced `POST /preview`, keyed on
  the serialised payload so an identical body rebuilt each render does not re-fetch. Keeps
  the previous answer while a new one is in flight.
- **`features/purchasing/hooks/useReceiptLots.ts`** and **`useReceiptReturns.ts`** —
  best-effort decorations for the detail screen. `productBatches:read` and
  `purchaseReturns:read` are permissions separate from `goodsReceipts:read`, so a refusal
  costs the lot column or the returns notice, never the page.
- **`features/purchasing/hooks/useReceiptFilterOptions.ts`** — the toolbar's two dropdowns,
  deliberately **unfiltered** unlike `useSupplierOptions`: that one feeds forms, where an
  inactive vendor must not be selectable; this feeds a read, and a vendor deactivated last
  month still delivered everything they delivered.
- **`features/purchasing/components/ReceiptsToolbar.tsx`**, **`ReceiptsTable.tsx`** — the
  list, split as `SuppliersScreen` is. The table has no actions column.
- **`features/purchasing/components/ReceiptPreviewJournal.tsx`** — the shim over the
  labelling gap above, with the mapping's justification in its header and a note on what
  removes the file.
- **`services/purchaseReturn.service.ts`** — `list` only, so the receipt detail can answer
  "has this already been returned against?". The returns screens are still on the prototype
  store; wrapping their writes now would put two ways to return goods in the codebase.
- **`docs/features/goods-receipts.md`**, **`tests/ReceiptScreens.test.tsx`**,
  **`tests/goodsReceipt.service.test.ts`**.

### Changed

- **`services/goodsReceipt.service.ts`** — gained `getById`, `create` and `preview`. The
  header no longer says "read-only here because the screen still runs on the prototype
  store"; that reason is gone, and the remaining absences are the backend's design.
- **`features/purchasing/components/ReceiptsScreen.tsx`** — rewritten onto the API. The
  headline total comes from `/goods-receipts/summary`, summed server-side across every
  receipt ever rather than over the visible page.
- **`features/purchasing/components/ReceiptDetail.tsx`** — rewritten onto `GET /:id`. Gained
  loading / not-found / error states, the `createdByName` and per-line unit the API resolves,
  and a notice when returns already exist. **Lost its journal panel**: the payload carries no
  lines, and reconstructing an entry from `total` and `taxAmount` would be the screen
  asserting what was posted rather than reading it.
- **`features/purchasing/components/ReceiptForm.tsx`** — rewritten onto `/preview` and
  `POST`. Lost the local HPP simulation, the **Nomor faktur supplier** field and the
  **Jatuh tempo** display — the API accepts neither, and both belong to the purchase invoice
  that is filed afterwards. `taxAmount` is now omitted from the payload on consignment rather
  than sent as `"0"`, because the endpoint forbids the key there.
- **`app/(dashboard)/dashboard/purchasing/receipts/*`** — wrapped in `RequirePermission`.
  The create page is gated on `create` rather than `read`, because `/preview` is itself gated
  on `create` and a read-only role would otherwise meet a 403 on the first keystroke.
- **`types/api.ts`** — added the goods-receipt detail, create, preview and purchase-return
  list shapes. Now imports two preview row types from `types/inventory.ts` (type-only, and
  that file imports nothing, so it cannot cycle): a receipt's preview returns the stock
  gateway's own rows verbatim, and redeclaring them would be a second definition that drifts.
- **`tests/PurchasingScreens.test.tsx`** — the `ReceiptForm` and `ReceiptsScreen` blocks were
  removed; those screens no longer touch `demoStore`. What remains is payables, returns and
  the hub.

---

## [Unreleased] — Inventory hub, the document a ledger row points at, and a business that can read itself

Branch: `feature/inventory-purchasing`.

**Business information, in the account dropdown.** `/dashboard/profile` answered "who am I";
nothing answered "what business am I in". A signed-in user could not see their own tenant's
timezone, currency, plan or trial deadline anywhere in the app — the data existed, and only a
platform owner had a route to it. The new screen at `/dashboard/business` reads
`GET /tenants/me` (`PawCRM-Backend` 0.25.0) and lays the tenant out in four cards. It hangs
off the top-bar account menu below **My profile**, not the sidebar: those two questions belong
together, and Master Data is where records are *maintained* — this screen is read-only, so it
would have been the one entry in that group leading nowhere you can act. See
`docs/features/business-information.md`.

**Read-only, and there is no `update` in the service either.** Renaming a business, changing
its slug or moving its timezone are not per-user preferences: the slug is a public URL
identifier existing links depend on, and the timezone re-anchors every report and every stock
movement date the tenant has. Those edits stay behind platform administration. Every instant
on the screen is formatted **in the tenant's own timezone** — which is what that field is for,
and a trial deadline read on a laptop still set to UTC is a day out at either end of the day.

**The Inventory landing screen is wired.** It was the last screen in the module still
computing its answers from the in-memory prototype store, and both of its alert lists were
wrong in ways nobody would have noticed: "perlu restock" compared **one warehouse's** shelf
against `minStock` — a per-**product** threshold — and listed the same product once per
warehouse, while the expiry list could only ever see the fixtures it held. Both now come
from the API, five rows each, badged with the server's real total. See
`docs/features/inventory-hub.md`.

**The stock card names the document behind a row.** `referenceNo` (`PawCRM-Backend` 0.24.0)
fills the **Referensi** column with `OPN-2026-0007` where it previously offered only the
kind of document. `null` on every other reference type, and the fallback is the type label —
never `reference.id`, which names nothing a reader can look up. This closes the last piece
of gap 2 in `PawCRM-Backend/docs/stock-card-gaps.md`; nothing on the stock card is waiting
on the backend now.

### Added

- **`features/inventory/hooks/useLowStockAlert.ts`** — `GET /products/low-stock`, five rows
  and the total. Takes an `enabled` flag, which is the permission gate: without
  `products:read` **no request is issued**, because a landing page that opens on a 403 for a
  section the user was never meant to see is worse than one that quietly does not offer it
- **`features/inventory/hooks/useExpiringAlert.ts`** — `GET /product-batches/expiring`,
  same shape, 30-day horizon echoed back by the API so the caption hardcodes no number
- **A `Kategori` card on the hub**, which the sidebar had and the hub did not
- **`docs/features/inventory-hub.md`**
- **`app/(dashboard)/dashboard/business/page.tsx`** — the Business information screen, guarded
  by `RequirePermission feature="tenants"` so direct URL entry shows Access denied rather than
  a page that can only ever load a 403
- **`features/tenant/`** — `useTenant` (one fetch, plus `refetch` for the error state's **Try
  again**), `TenantDetail` (the four cards, timezone-aware dates, the trial sentence, the
  logo/initials fallback) and `TenantSubscriptionBadge`. The badge keeps `past_due`,
  `suspended` and `cancelled` in three different tones on purpose: a bill to pay, a service
  already withheld, and the end of the relationship are not the same news
- **`services/tenant.service.ts`** — `me()` and nothing else. The rest of `/api/tenants`
  administers *other* businesses; a method for it here would invite a screen that has no
  business existing in a tenant's own app
- **`types/api.ts`** — `Tenant`, `TenantSubscription`, `TenantSettings`
- **`components/icons.tsx`** — `BusinessIcon`, a storefront, deliberately unlike the branch
  building and the warehouse shed
- **`UserMenu.test.tsx`** (3 tests) — the dropdown had none until now
- **`docs/features/business-information.md`**

### Changed

- **`InventoryHub` reads the API and computes nothing.** The "Prototype · data contoh" badge
  and the **Reset data** button are gone with the fixtures behind them
- **Every action card is permission-gated**, with the same requirements the sidebar uses, so
  the hub and the menu cannot disagree about what a role may open. `Penyesuaian cepat` is
  gated on `stockMovements:create` — a read-only role never sees the shortcut that writes
  off stock with no document behind it
- **`StockLedgerTable` renders `referenceNo`** above the type when the row has one
- **`types/inventory.ts`** — `StockMovement.referenceNo: string | null`, replacing the
  comment explaining why the field did not exist
- **`InventoryScreens.test.tsx` is now a mocked-service suite** (7 tests) rather than a
  demo-store mount test
- **`UserMenu` carries a third entry**, `Business information`, between the profile link and
  Logout. Rendered only when `can("tenants", "read")` — the same grant `GET /tenants/me`
  requires, which no seeded role but Owner holds (by the super-admin bypass), because the
  screen shows the subscription plan and billing state. A link that can only ever open an
  access-denied panel is worse than no link
- **`tests/helpers/renderWithAuth.tsx` accepts a `user`**, for components that show who is
  signed in as well as what their role may do. Still defaults to `null`

### Fixed

- **The count sheet no longer blanks its product names on save** (`PawCRM-Backend` 0.24.1).
  `PATCH /stock-opnames/:id` answered with bare `productId`s, and this screen renders that
  response — it has to, since every derived quantity comes back recomputed — so ticking
  **Dihitung** or typing a quantity replaced "Royal Canin Adult — 1kg / beef · RC-ADULT-1KG-BEEF
  · pcs" with a dash and an ObjectId. The backend now returns the same labels the detail
  read does; nothing changed in this repo.

  The mocked `update` in `OpnameScreens.test.tsx` had always returned a labelled sheet,
  which is why the tests did not catch it — a mock more generous than the API tests a
  server that does not exist. It now asserts the name survives a save, with a note to keep
  the mock mirroring the real response.

### Note

`demoStore` is still here and still real: the **purchasing** prototype screens run on it and
eight components import it. What left with this change is the last inventory consumer.

---

## [Unreleased] — Stok Opname

Branch: `feature/inventory-purchasing`.

Inventory → Stok Opname moves off the prototype store onto `/api/stock-opnames`; the
`demoStore`'s opname half is gone with it. See `docs/features/stock-opname.md`.

**Four backend changes came first** (`PawCRM-Backend` 0.23.0), all found while wiring this
screen and all the same shape of problem — the API knew something the sheet needed and was
not saying it: `items[].countedAt` (+ the `counted` flag), `itemCount` / `countedCount` on
the list, `warehouseName` on the list, and `productUnit` / `productHasExpiry` per line.
There is no client-side workaround for any of them left in this repo.

**The decision that shapes the screen.** System quantity is re-read **at submit**, not
frozen when the sheet opened — a count takes an afternoon and the shop keeps selling. So
the browser subtracts nothing: `physicalQty` goes up, every other quantity comes back
computed. A locally derived variance would drift from the posted one, silently.

### Added

- **`stockOpnameService`** — seven endpoints, no `unsubmit` and no `restore`: submitting
  posts immutable movements and a journal entry, so a sheet that could go back to draft
  would claim to describe a count whose corrections had already been booked
- **`useOpnames`** — the list, with status / warehouse / date-range / number-search filters
  and ordinary page-jump paging
- **`useOpnameSheet`** — the detail and its **800 ms debounced auto-save**. A stale response
  never lands on newer edits (a revision counter discards it), and `flush()` runs before a
  submit so the last thing typed cannot be left behind in a timer
- **`useOpnamePreview`** — on-demand rather than debounced, unlike `useMovementPreview`: a
  sheet has hundreds of lines and the question is only asked once, when somebody is about
  to accept the whole thing
- **`OpnameStartCard`** — warehouse + optional category. Surfaces the one-open-draft `409`
  with its `reason`, which names the sheet that is in the way
- **`OpnameToolbar`**, **`OpnameStatusBadge`**, and a rewritten **`OpnameScreen`** /
  **`OpnameSheet`**
- **`stockOpnames` in the permission catalog**, with `submit` as its own action. Seeded
  Staff count but do not accept the variance; the sheet says so plainly rather than hiding
  a disabled button
- **23 tests** in `OpnameScreens.test.tsx`, replacing the demo-backed
  `InventoryCatalogue.test.tsx`

### Changed

- **The journal panel is fetched, not computed.** The prototype hardcoded a surplus to
  "4901 Pendapatan Lain-lain"; the ledger books **both** directions to the
  inventory-adjustment account. The page copy claimed the same thing and is corrected
- **The nav entry is gated on `stockOpnames:read`**, was `stockMovements:create` — which
  hid the whole feature from exactly the people who do the counting, while showing it to
  anyone who can post a manual adjustment
- **Both opname routes are wrapped in `RequirePermission`**, matching every other
  inventory page. They had no guard at all
- **`jest.config.ts` declares `moduleNameMapper` for the `@/` alias**, so
  `jest.mock("@/services/…")` resolves. Ordinary imports were never affected —
  `next/jest`'s SWC transform resolves the tsconfig `paths` alias at transform time — but
  `jest.mock()` is resolved at runtime by jest-resolve, which reads moduleNameMapper and
  nothing else. The repo had avoided this by convention (the service suites spy on the
  `apiClient` singleton; `stockLedger.service.test.ts` says so in as many words), and that
  convention does not extend to a COMPONENT test, which must replace the whole service
  module. Declared in the runner rather than by adding `baseUrl` to tsconfig, which would
  change how the compiler resolves every bare import

### Removed

- **`demoStore`'s opname half** — `startOpname`, `opnameItemsOf`, `setOpnameCount`,
  `opnameDiff`, `opnameTotal`, `submitOpname` and the two state arrays, plus their tests.
  The store now backs purchasing only

---

## [Unreleased] — Batch & Expired

Branch: `feature/inventory-purchasing`.

Inventory → Batch & Expired moves off the prototype store onto
`/api/product-batches`, `/summary` and `/expiring`. See
`docs/features/batch-expiry.md`.

**Four backend changes came first** (`PawCRM-Backend` 0.22.0), all of them
consequences of reading the lot collection ACROSS products and warehouses rather
than within one pair: labels on every row, a summary endpoint, no-expiry lots
sorting last, and a batch-code search. There is no client-side workaround for any
of them left in this repo.

### Added

- **`productBatchService.summary`** + **`useBatchSummary`** — the four tiles.
  Counts span every matching lot rather than the page, and **Nilai berisiko** is
  now a real number: summing `qtyRemaining × costPerUnit` needs every row, so the
  demo screen was the only version that could ever have shown it
- **`useBatches`** — picks the endpoint. A horizon asks `/expiring` (cumulative,
  live lots with a date); "Semua lot" and any batch-code search ask
  `/product-batches` (everything, including exhausted and never-expiring lots)
- **`useWarehouseOptions`** — just the warehouses. Deliberately smaller than
  `useStockCardLookups`, which also pages the catalogue for a product picker this
  screen does not have: its rows already name their own product
- **Batch-code search**, and `BatchesToolbar` / `BatchesTable` split out of the
  screen
- `types/inventory.ts` — `ProductBatch` gains `productName`, `productSku`,
  `productUnit`, `warehouseName`; new `BatchExpirySummary`, `BatchExpiryBucket`;
  `ProductBatchListQuery` gains `search`, `expiryFrom`, `expiryTo`
- Tests: `BatchesScreen.test.tsx` (11)

### Changed

- **`BatchesScreen` computes nothing.** Counts, value, labels and row order all
  arrive resolved. The order matters most: with the list paged server-side, a
  client that re-sorted would only be reordering the twenty rows it holds,
  producing a sequence that changes meaning at every page boundary
- **Two controls explain themselves when they go quiet** — the horizon is
  disabled during a search (the alert endpoint cannot filter by code, and tracing
  a lot is a question about its whole life), and the exhausted-lot toggle is
  hidden outside audit mode (an exhausted lot cannot expire into anything)
- `/dashboard/inventory/batches` sits behind
  `RequirePermission feature="productBatches"`
- Inactive warehouses appear in the filter, marked. A closed location still holds
  the lots it held — forgotten stock is what this report exists to surface
- `InventoryCatalogue.test.tsx` is down to Opname, the last inventory screen with
  no backend

---

## [Unreleased] — Preview dari server, dan retry yang aman

Branch: `feature/inventory-purchasing`. Follows the entry below, which shipped the
two write forms against an API that could only report what it had already done.

`PawCRM-Backend` 0.21.0 closed the three gaps that entry lists, and this pass
**deletes the code that existed because of them**. Net effect on the user: the
preview panel now shows what will actually be written, and a save that times out
can be retried without moving stock twice. Net effect on the code: three files
fewer.

### Added

- **`stockMovementService.preview`** + **`useMovementPreview`** — a debounced
  (350 ms) `POST /stock-movements/preview`. It keeps the last answer on screen
  while a new one is in flight, because clearing it makes the panel flicker
  between every keystroke and its response
- **`utils/idempotency.ts`** — `newIdempotencyKey`, minted once per **intent**.
  Both forms keep it across a failed attempt, so a retry replays instead of
  writing twice, and replace it only after a save succeeds
- `types/inventory.ts` — `PreviewStockMovementInput`, `PreviewMovementRow`,
  `PreviewHpp`, `StockMovementPreview`, `HppCalculation`; `idempotencyKey` on
  both create inputs

### Removed

- **`features/inventory/utils/preview.ts`** — the reimplementations of FEFO
  allocation, the perpetual weighted average and the counter-account choice. They
  agreed with the server; the risk was that a future divergence would not throw,
  it would render a confident wrong number the user approves
- **`hooks/useJournalAccounts.ts`** and **`services/chartOfAccounts.service.ts`**
  — they existed only to put names on the two account codes `utils/preview.ts`
  hardcoded. The preview response carries codes and names
- **`ChartAccount`** from `types/api.ts`, and **`stockPreview.test.ts`** (14
  cases) — the rules they pinned now have one implementation, in the backend

### Changed

- **Both forms build ONE payload and use it for the preview and the save.** A
  preview of a different request is worse than no preview, and that object was
  the only place they could diverge; the test asserts they match
- **Neither form loads lots any more.** `useProductBatches` was there to compute
  the FEFO split — the preview now names every lot it would touch
- `FefoPreview` takes the server's rows instead of a client-computed allocation;
  `HppStrip` takes `HppCalculation` from `types/inventory` instead of a demo-store
  type. The "sisa lot" caption is gone — it was the one field the preview does not
  return, and keeping a second request alive for a caption is not a trade worth
  making
- `StockMovementForms.test.tsx` rewritten around the fetched preview (14 → 15)
- **The expiry checkbox on an existing variant family now says that changing it
  cascades to every variant.** The backend cascade is new (`PawCRM-Backend`
  unreleased); the checkbox looks like a small edit and is not one, and finding
  that out from a stock card six weeks later is worse than reading it here
- **Penyesuaian Stok now has a sidebar entry**, last in the Inventory menu, with
  a new `AdjustmentIcon`. It was previously reachable only from the hub. Last on
  purpose — a real discrepancy is found by an opname and moved goods are moved by
  a transfer, so the by-hand correction should not sit above either — and gated
  on `stockMovements:create`, which the seeded Staff role does not hold.
  `nav.test.ts` pins both the order and the read-only case

---

## [Unreleased] — Penyesuaian & Transfer Stok

Branch: `feature/inventory-purchasing`.

The two screens that **write** to the stock ledger move off the prototype store
onto `POST /api/stock-movements`. Together they are the entire write surface the
API offers a client — an `operation` of `adjustment` or `transfer`, and nothing
else — so the stock module's write side is now complete. See
`docs/features/stock-movements.md`.

Frontend only. **No backend change**, but three new gaps were found and written
up: `PawCRM-Backend/docs/stock-card-gaps.md` gaps 7–9.

### Added

- **`stockMovementService.create`** — posts an adjustment or a transfer and
  returns the ARRAY the server wrote. Callers must not assume one row: FEFO
  splits a withdrawal across every lot it draws from, and a transfer writes a
  pair per lot
- **`services/chartOfAccounts.service.ts`** (`getByCode`) — one method, so the
  journal preview can name the accounts it is about to post against. By code,
  never by id: account ids differ per tenant, codes do not
- **`features/inventory/utils/preview.ts`** — `previewFefo`, `previewHpp`,
  `previewAdjustmentJournal`. The API has no preview endpoint, so these
  reimplement three server decisions; the file's header says which, and why the
  duplication is a risk rather than a convenience
- **`hooks/useJournalAccounts`** — code → name, and the only lookup in this
  feature that swallows its failure. The preview falls back to showing `5201`,
  which is still true; a red banner because the role lacks
  `chartOfAccounts:read` would block a stock adjustment over a missing caption
- `types/api.ts` — `ChartAccount`
- Tests: `stockPreview.test.ts` (14), `StockMovementForms.test.tsx` (14)

### Changed

- **`StockAdjustmentForm` and `StockTransferForm`** now read their warehouses,
  products, lots and HPP from the API and post to it. The UI is unchanged; what
  changed is that Simpan writes something that survives a refresh
- **Only ACTIVE warehouses are offered**, unlike the stock card, which lists
  inactive ones because it only reads. The API refuses a movement at an inactive
  location, so offering one would be a rejection waiting to happen
- **The transfer form refuses to render** with fewer than two active warehouses,
  rather than showing two selects stuck on the same value above a disabled button
- **Rejections are surfaced with `ApiError.fullMessage`**, which carries the
  actionable half of a 400 ("Warehouse 'Gudang Bazar' is not active…") that
  `message` alone drops. Only rules a user can fix without a round trip are
  validated locally
- **The success toast reports the SERVER's row count**, not the predicted one —
  so a disagreement between preview and reality is visible rather than silent
- `InventoryScreens.test.tsx` is down to the hub: it is the last inventory screen
  on the demo store, apart from opname

### Known limitations

Each traced to a backend gap — `PawCRM-Backend/docs/stock-card-gaps.md`:

- the previews are computed in the browser and can drift from the server's own
  rules (gap 7); both forms say so in their copy
- the account codes a movement posts to are hardcoded; only their names are
  looked up per tenant (gap 8)
- **a manual movement cannot be retried safely** (gap 9). The submit button is
  disabled while in flight, which stops a double click and nothing else: a
  request that times out and is retried writes the adjustment twice

> **All three are gone** — `PawCRM-Backend` 0.21.0 closed the gaps and the entry
> above rewired the forms. This entry is kept as the record of what the screens
> looked like when the API could only report what it had already done.

---

## [Unreleased] — Kartu stok, rewired

Branch: `feature/inventory-purchasing`. Follows the entry below, which shipped the
screen against an API that returned neither a balance nor a label.

`PawCRM-Backend` 0.20.0 closed five of the six gaps that entry lists, and this
pass **deletes the workarounds** rather than keeping them beside the new fields.
Net effect on the user: the balance column survives every filter, the ledger
pages like every other list, there is a "diinput oleh" column, period totals, and
an export button. Net effect on the code: less of it.

### Added

- **Period tiles** — `useStockCardSummary` + `GET /stock-movements/summary`.
  Total masuk, keluar, nett and movement count for the filtered range. Omitted
  before, because summing the loaded page reports the page and grows as the user
  pages. Deliberately not keyed on the page number: the totals do not change when
  you page
- **Export CSV** — a button beside the filters it obeys, plus
  `stockMovementService.export` and a new `apiClient.download`. The blob is
  fetched and saved rather than linked to: an anchor pointing at the endpoint
  would turn a 403 into a downloaded file containing `{"success":false}`.
  `download` shares credentials, timeout and error translation with every other
  call — only the `{ success, data }` unwrapping is skipped, because it would
  throw on the first byte of CSV
- **"Diinput oleh" column**, and `batchCode` read straight off the row. `null`
  renders as "sistem" — the API's answer for a movement a background process
  posted
- **`openingBalance` in the ledger's footer** — the balance before the page's
  oldest row, so a reader can check the page's own arithmetic
- `types/inventory.ts` — `StockMovement` gains the six fields the API computes
  (`balanceAfter` and the five labels); new `StockMovementPage`,
  `StockMovementSummary`; `ProductListQuery.holdsStock`

### Changed

- **The ledger pages by jumping again.** `Pagination` replaces "Muat lebih
  banyak", and `useStockCard` returns one page instead of accumulating. The
  append-only feed existed because the balance was reconstructed by walking
  backwards from the newest row, which a page-jump would have invalidated —
  every balance on screen wrong by the sum of the pages it skipped
- **No filter costs the balance column any more.** The paragraph in
  `StockCardFilters` explaining that a type or end-date filter disabled it is
  gone, not reworded: the server sums the rows it hides too
- **The product picker issues one request** (`holdsStock=true`) instead of two
  merged by type, and no longer carries a copy of the server's
  `STOCK_TRACKING_TYPES`
- **`utils/ledger.ts` is down to `partitionBatches` and `qtyAtWarehouse`.**
  `withRunningBalance` and `canAnchorBalance` are deleted; the file's header now
  records why they existed, so nobody rebuilds them
- `useProductStock` is still fetched, but for the position tiles only — it is no
  longer the balance anchor, so a stale reading no longer moves every number in
  the table
- Tests: `stockLedger.test.ts` drops its balance arithmetic (10 → 4);
  `StockCardScreen.test.tsx` rewritten around the rendered-not-derived seams
  (8 → 14); `stockLedger.service.test.ts` covers `summary` and `export` (8 → 10)

### Still missing

- **`referenceNo`.** The Referensi column names a document *kind*, not a
  document, because `goodsreceipts`, `postransactions` and `stockopnames` are not
  collections yet. It lands with those modules

---

## [Unreleased] — Kartu stok

Branch: `feature/inventory-purchasing`.

Inventory → Kartu Stok moves off the prototype store and onto the real
`/api/stock-movements` and `/api/product-batches`. Frontend only — **no backend
change**. See `docs/features/stock-card.md`, and
`PawCRM-Backend/docs/stock-card-gaps.md` for what the API still owes this screen.

### Added

- `services/stockMovement.service.ts` (`list`, `getById`) and
  `services/productBatch.service.ts` (`list`, `expiring`, `getById`) — both
  **read-only**, mirroring APIs that have no write surface. The ledger is
  append-only; a batch is born from a movement
- `features/inventory/utils/ledger.ts` — `withRunningBalance`,
  `canAnchorBalance`, `partitionBatches`, `qtyAtWarehouse`. The balance the API
  does not return, derived by anchoring backwards from `qtyOnHand` on BigInt
  minor units
- Hooks `useStockCardLookups`, `useProductStock`, `useStockCard`,
  `useProductBatches` — one `refreshKey` drives the last three together, so a
  refresh can never measure a fresh ledger against a stale anchor
- `components/StockCardFilters.tsx` (movement type, date range, reset, refresh),
  `StockLedgerTable.tsx`, `BatchLotTable.tsx`
- `types/inventory.ts` — `StockMovementListQuery`, `ProductBatchListQuery`,
  `ExpiringBatchListQuery`, `ExpiringBatchesResult`
- Tests: `stockLedger.test.ts` (10), `stockLedger.service.test.ts` (8),
  `StockCardScreen.test.tsx` (8)

### Changed

- **`StockCardScreen`** rewritten as a container over the four hooks: per-section
  loading, per-section errors, an empty state, and stat tiles that read `—`
  rather than guessing when `products:read` is missing
- **The ledger appends, and no longer offers a pager.** The running balance is
  anchored to the current on-hand quantity, which is only valid while the loaded
  rows run contiguously from the newest one — a page-jump would leave every
  balance on screen wrong by the sum of the pages it skipped
- **A movement-type filter or an end date blanks the balance column**, on purpose
  and with the reason stated on the filter itself: both hide rows newer than the
  ones displayed, which breaks the anchor
- **`WarehouseProductPicker`** gains opt-in `includeInactiveWarehouses` and a
  `productPlaceholder`. Only a read-only screen passes the first — the stock card
  does, because a deactivated warehouse still owns its whole history
- `/dashboard/inventory/stock-card` now sits behind
  `RequirePermission feature="stockMovements"`; the batch tab carries its own
  `productBatches:read` check and is not requested without it
- `InventoryScreens.test.tsx` drops its three StockCardScreen cases — that screen
  no longer reads the demo store, so it needs mocked services and an auth context

### Known limitations

Each traced to a backend gap rather than a frontend decision — see
`PawCRM-Backend/docs/stock-card-gaps.md`:

- no "siapa yang input" column, and the reference shows a document **type**
  rather than a number (gap 2)
- no period totals and no CSV/PDF export (gaps 3 and 4)
- the product picker issues two requests and caps at 500 rows per type, warning
  when a catalogue exceeds it (gap 5)

> **All of these are gone** — `PawCRM-Backend` 0.20.0 closed the gaps and the
> entry above rewired the screen. `referenceNo` is the one that remains. This
> entry is kept as the record of what the screen looked like when the API
> returned neither a balance nor a label.

---

## [Unreleased] — Warehouse management

Branch: `feature/inventory-purchasing`.

Master Data → Warehouse, against the already-existing `/api/warehouses`. Frontend
only — **no backend change**. See `docs/features/warehouse-management.md`.

### Added

- `features/warehouses/` — `WarehousesScreen`, `WarehousesToolbar`,
  `WarehousesTable`, `WarehouseStatusBadge`, `WarehouseBranchSelect`,
  `WarehouseCreateForm`, `WarehouseEditForm`; hooks `useWarehouses` (list query
  state) and `useWarehouseBranches` (branch names + picker options)
- Routes `/dashboard/master/warehouses`, `/new` and `/[id]`, each behind
  `RequirePermission` (`warehouses` / `:create` / `:update`)
- `types/api.ts` — `Warehouse`, `WarehouseListQuery`, `CreateWarehouseInput`,
  `UpdateWarehouseInput`
- `utils/validation.ts` — `validateWarehouseName`, `validateWarehouseAddress`,
  `validatePicName`, `validatePicPhone`
- `components/icons.tsx` — `WarehouseIcon`; Master Data → Warehouse nav entry
  gated on `warehouses:read`
- Tests: `warehouse.service.test.ts` (7), `WarehousesTable.test.tsx` (9),
  `WarehouseCreateForm.test.tsx` (5)

### Changed

- **`services/warehouse.service.ts`** grows from a picker's `list` into the full
  set (`list/getById/create/update/remove/restore`). `list` gains `page`,
  `defaultBranchId` and `includeDeleted`, keeps its `limit: 100` default, and now
  returns `PageResult<Warehouse>` — structurally assignable to the slim
  `StockWarehouse`, so `useCatalogLookups` and the product screens are untouched
- **`api-client` / `ApiError` carry the envelope's `reason`**, with a new
  `ApiError.fullMessage` (`"message — reason"`). The warehouse delete guards put
  the actionable half of a 409 there ("still holds stock for 3 product(s)"), and
  it was being dropped — every feature benefits, none changes behaviour
- A branch's **default warehouse offers no Delete** (table and danger zone): the
  backend refuses it unconditionally, so the badge and a line of copy explain it
  instead of a button that can only 409
- `tests/ProductForm.test.tsx` / `tests/ProductsScreen.test.tsx` warehouse
  fixtures are now full `Warehouse` documents

### Not implemented (needs backend)

Reassigning a branch's default warehouse (no `set-default` route, `isDefault` is
server-owned), a per-warehouse stock summary, a populated `defaultBranchId`, and
filtering for central (unassigned) warehouses only.

---

## [Unreleased] — Product & Variant management

Branch: `feature/inventory-purchasing`.

The catalogue screens leave the demo store and run against `/api/products`. See
`docs/features/product-management.md`.

### Added

- `services/product.service.ts` —
  `list/getById/listVariants/getByBarcode/lowStock/create/update/remove/restore`
- `services/warehouse.service.ts` — `list`, for the stock-column and
  opening-stock pickers
- `features/inventory/hooks/` — `useProducts` (list query state),
  `useProductVariants` (lazy, cached per-parent expand), `useProductDetail` (the
  edit screen's product + family), `useCatalogLookups` (categories + active
  warehouses), `useBundleCandidates` (component picker, bundle mode only)
- `features/inventory/utils/catalogue.ts` — the pure helpers both screens share:
  `qtyAt`, `stockOf`, `limitedByAt`, `variantCombinations`, `attributesFor`,
  `defaultVariantSku`, `matchVariant`
- `features/inventory/components/` — `ProductsToolbar` and `ProductsTable`, split
  out of `ProductsScreen` the way the customers and branches screens are
- `types/inventory.ts` — the request/response contract: `ProductStockRow`,
  `BundleAvailabilityRow`, `ProductListQuery`, `OpeningStockInput`,
  `CreateFamilyVariantInput`, the `CreateProductInput` discriminated union,
  `UpdateProductInput`, `CreatedProduct`, `OpeningStockReport`
- Tests: `ProductsScreen.test.tsx` (11) and `ProductForm.test.tsx` (15), both
  against mocked services

### Changed

- **`ProductsScreen`** now lists from the API with server pagination, asking for
  `excludeVariants=true` so a family is one row and `total` counts what is shown.
  A parent's variants are fetched when its row is expanded, and cached. The
  warehouse selector re-reads quantities already on the page rather than
  refetching. Delete and restore run through `ConfirmDialog` and surface the
  backend's refusal verbatim — it names which guard stopped it
- **`ProductForm`** now loads its product (and, for a parent, its variants)
  before rendering, and saves through the API: a family goes in ONE request
  carrying `variants[]`; an edit sends only the fields that changed and creates
  only the combinations that are new. `openingStock` travels with the create, per
  variant, and a `posted: false` on a successful create is reported to the user
  rather than swallowed. Field-level refusals (`400` and `409` alike) bind to
  their inputs, and row-scoped ones to the variant row
- **`BundleComponentEditor`** is fed by the API instead of the demo store
- The three product routes are behind `<RequirePermission feature="products">`,
  and every row action behind `<Can>`
- `demoStore` products carry `stockByWarehouse: []`, matching the API shape now
  that `Product` is the API's type. The demo store still backs the stock card,
  batches, opname and transfer screens
- `tests/InventoryCatalogue.test.tsx` keeps the demo-backed batch/opname
  coverage; the catalogue cases moved to the two new files

### Requires (backend, same branch)

`POST /api/products` accepting `variants[]` + `openingStock`, `excludeVariants`
on the list with parent-surfacing search, `variantCount`/`variantStock` on a
parent, `bundleAvailability` on a bundle, and `details[]` on a `409`. See the
backend changelog `[0.19.0]`.

---

## [Unreleased]

Branch: `feature/project-initialization`.

### Added

**Customer management (Master Data → Customer)** — CRUD for the people a tenant
does business with (pet owners, buyers, clients), against the existing
`/api/customers` API. See `docs/features/customer-management.md`.

- Routes: `/dashboard/master/customers` (list), `/customers/new` (create),
  `/customers/[id]` (edit) — mirrors the branches routes
- `features/customers/` module: `CustomersScreen`, `CustomersToolbar` (search +
  VIP-tier filter + show-deleted), `CustomersTable` (name/email/phone, VIP +
  status badges, delete/restore row actions), `CustomerCreateForm`,
  `CustomerEditForm` (details + danger-zone), `VipTierSelect`,
  `CustomerVipBadge` / `CustomerStatusBadge`, and the `useCustomers` hook
- `services/customer.service.ts` — `list/getById/create/update/remove/restore`
- `types/api.ts`: `VipTier`, `Customer`, `CustomerListQuery`,
  `CreateCustomerInput`, `UpdateCustomerInput`
- Validation: `validateCustomerName`, `validateOptionalEmail`,
  `validateCustomerPhone`, `validateCustomerAddress`
- Gated on a new `customers` permission; nav item + `CustomerIcon`; pages behind
  `<RequirePermission feature="customers">`
- **Backend (permission wiring only, no business-logic change):** added
  `customers` to the RBAC catalog (`config/permissionCatalog.js`), gated every
  `/api/customers` route with `requirePermission("customers", …)` (mirroring
  `/api/audit-logs`), and granted the new permission to the seeded **Manager**
  (all actions) and **Staff** (read) roles. `PERMISSION_CATALOG` in the frontend
  hand-synced to match.
- Tests: `CustomerCreateForm.test.tsx`; `nav.test` updated; backend
  `customer.api.test.js` updated for the new gate (all 646 backend tests pass)

**Audit Log (Master Data → Audit Log)** — a read-only, paginated, filterable view
of the tenant's security audit trail. Gated on the new `auditLogs:read`
permission; the nav item and page hide without it. Reuses the master-data list
pattern (toolbar + table + pager) with no row actions, since the trail is
immutable.

- `features/audit-logs/`: `AuditLogsScreen`, `AuditLogsToolbar` (search + action
  filter + refresh), read-only `AuditLogsTable` (populated actor, tinted
  `AuditActionBadge`, metadata summary), `useAuditLogs` hook, and the action
  vocabulary in `constants.ts`
- `services/auditLog.service.ts` — `list(query)` → `GET /api/audit-logs`
- `types/api.ts`: `AuditLog`, `AuditLogActor`, `AuditLogBranchRef`,
  `AuditLogListQuery`
- `auditLogs: ["read"]` added to `PERMISSION_CATALOG`; nav item + `AuditLogIcon`;
  route `app/(dashboard)/dashboard/master/audit-logs/page.tsx` behind
  `<RequirePermission feature="auditLogs">`
- Search highlight: matched characters in the Action / IP cells are wrapped in a
  yellow `<mark>` via the new shared `HighlightText` component, so it is clear why
  each row was returned. Backend search is a case-insensitive substring match
  over `action` / `ipAddress`, so a few characters is enough.
- Tests: `auditLog.service`, `AuditLogsTable`, `HighlightText`; `nav.test` updated

**Search highlight extended to master data** — the same yellow `HighlightText`
now marks the matched characters in the Users (name, email), Roles (name,
description) and Branches (name, address) tables, paired with the backend's
substring search so typing a few characters highlights exactly what matched.
Each list screen passes its active `search` term down to the table.

**Numbered pagination** — the shared `Pagination` component now renders page
numbers (`1 2 3 …`) with a windowed range and ellipses, flanked by
Previous / Next, instead of Prev/Next alone — easier to jump around once a list
has many pages. Backward compatible (same props), so every list screen (users,
roles, branches, audit log) picks it up automatically. Windowing logic is the
pure `getPageItems(current, total)`, unit-tested in `Pagination.test.tsx`.

**Permission gating (RBAC-aware UI)** — frontend-only. Navigation, buttons and
pages hide when the signed-in user's role lacks the matching permission. A UX
guard, not a security boundary; the backend still authorizes every request. No
backend changes. See `docs/features/permission-gating.md`.

- `features/permissions/` module: `usePermissions` (`can` / `canAny` / `canAll`
  + super-admin bypass), `<Can>` render gate, `<RequirePermission>` page guard
  with an Access-denied panel, and the `PERMISSION_CATALOG` / `Feature` /
  `Action` vocabulary (mirrors the backend catalog)
- Grants read from the auth payload: `AuthProvider` now holds `permissions` +
  `isSuperAdmin` from `/api/auth/login` and `/api/auth/me`
- `types/api.ts`: `AuthPermissions`; `LoginPayload` / `MePayload` extended
- Sidebar hides Master Data children (and the group when empty) via
  `filterNavItems`; Master create buttons, row actions and routes gated
- Tests: `nav.test.ts`, `permissions.test.tsx`, `tests/helpers/renderWithAuth`

**User management (Master Data → User)** — frontend CRUD for staff users against
the existing `/api/users` API. No backend changes. See
`docs/features/user-management.md`.

- Routes: `/dashboard/master/users` (list), `/users/new` (create),
  `/users/[id]` (edit) — the app's first dynamic route segment
- `features/users/` module: `UsersScreen`, `UsersToolbar`, `UsersTable`,
  `Pagination`, `UserCreateForm`, `UserEditForm`, `RoleSelect`,
  `BranchScopeField`, `StatusBadge`, `ConfirmDialog`, plus `useUsers` and
  `useLookups` hooks
- List with search, status filter, "show deleted" toggle and pagination; create
  with role picker + branch-scope picker; edit with status toggle, admin
  password reset, and delete / restore / unlock
- `services/user.service.ts` extended with `list`, `getById`, `create`,
  `update`, `setStatus`, `unlock`, `remove`, `restore`
- `services/role.service.ts`, `services/branch.service.ts` — read-only lookups
- `types/api.ts`: `PageResult<T>`, `UserListQuery`, `CreateUserInput`,
  `UpdateUserInput`, `Role`, `Branch`; `User` gained `lockedUntil`, `deletedAt`
**shadcn/ui component system** — the shared UI primitives and the user
management screens now render on [shadcn/ui](https://ui.shadcn.com/) (Radix +
CVA + Tailwind).

- Added `components/ui/*` (button, input, label, card, alert, badge, dialog,
  select, checkbox, radio-group, table), `lib/utils.ts` (`cn`), and
  `components.json`
- The `@/components` primitives (`Button`, `TextField`, `Card`, `Alert`) are now
  thin adapters over shadcn/ui, keeping their existing prop APIs so every call
  site (auth, profile, dashboard) is unchanged while the markup/styling comes
  from shadcn
- Users feature rebuilt on shadcn: `Table` (list), `Dialog` (confirmations),
  `Select` (role + status filter), `RadioGroup`/`Checkbox` (branch scope),
  `Badge` (status); icons switched to `lucide-react`
- `styles/globals.css` gained shadcn's semantic tokens (card/popover/muted-
  foreground/accent/destructive/input/ring), mapped onto the existing PawShip
  palette — additive, so the original tokens keep their meaning
- Dependencies added: `radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, and `tw-animate-css` (dev)
- `jest.setup.ts` polyfills `ResizeObserver` and pointer-capture/`scrollIntoView`
  so the Radix-based components render under jsdom

### Verified

- `npm test` — 57/57 passing (11 suites)
- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `/dashboard/master/users/[id]` server-rendered on
  demand, list and `/new` prerendered

---

## [0.1.0] — 2026-07-21

Project foundation. Branch: `feature/project-initialization`.

Infrastructure only — no business features, by design.

### Added

**Scaffolding**

- Next.js 16.2.10 (App Router), React 19.2.4, TypeScript 5 in strict mode, Tailwind CSS 4
- Feature-based folder structure: `components/`, `features/`, `hooks/`, `services/`, `types/`, `utils/`, `tests/`, `styles/`

**API layer**

- `services/api-client.ts` — the only module that calls `fetch`; prefixes the base URL, unwraps the `{ success, data }` envelope, builds query strings, serializes JSON bodies, and times out after 15 s
- `services/api-error.ts` — one error type for every failure mode, exposing `isNetworkError`, `isUnauthorized`, `isValidationError` and a `fieldErrors` map ready to bind to form inputs
- `services/health.service.ts` — backend health check; the reference implementation for this layer

**Types**

- `types/api.ts` — `ApiSuccess<T>`, `ApiFailure`, `ValidationDetail`, `HealthPayload`, `Paginated<T>`, mirroring the backend contract in `.claude/architecture.md`

**Configuration**

- `utils/env.ts` — the only module that reads `process.env`; defaults to the local backend outside production and fails the build if unset in production
- `.env.example`, and a `.gitignore` negation so it is committed while `.env*` stays ignored

**Application**

- `app/layout.tsx` — PawCRM metadata, Geist fonts, imports the relocated global stylesheet
- `app/page.tsx` — minimal placeholder; no dashboard, login or business UI
- `styles/globals.css` — moved out of `app/` to match `.claude/rules.md`

**Testing**

- Jest + React Testing Library via `next/jest`, 16 tests across 2 suites, no backend or network required
- `api-client.test.ts` — envelope unwrapping, URL/path normalization, query serialization, JSON body handling, and every error path: HTTP error, validation details, 401, network failure, non-JSON body, empty body, `success:false` under a 200
- `page.test.tsx` — component-testing smoke test asserting on accessible roles

**Tooling**

- `npm run test`, `test:watch`, `test:coverage`, `type-check`
- ESLint via `eslint-config-next` (flat config)

**Documentation**

- `README.md`, `docs/architecture.md`, `docs/deployment.md`, this changelog

### Verified

- `npm test` — 16/16 passing
- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `/` and `/_not-found` prerendered as static

### Deliberately not included

Foundation branch only. Each arrives with its own feature branch:

- Authentication, session handling, protected routes
- Dashboard, login page, customer views, business components
- State management library, design system, end-to-end tests

### Notes

- Folder is `PawCRM-Frontend/` on disk where the rules say `frontend/`
- The backend is a separate repository with its own remote
- `npm audit` reports 2 moderate advisories from `postcss` nested inside
  `next`; the only offered fix downgrades Next.js to v9. Build-time only,
  not shipped to the browser. See `docs/deployment.md`.
