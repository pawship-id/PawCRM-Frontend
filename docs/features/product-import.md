# Import Produk (Inventory → Produk → Import)

Bulk product creation from a spreadsheet, against `/api/products/import` —
template, preview, commit. Frontend half of backend `0.36.0`.

The screen exists for one moment in a tenant's life: the first day, when the
catalogue is four hundred SKUs sitting in a file somebody already maintains and
the only door into PawCRM is a form that takes them one at a time.

## What it does

Under **Dashboard → Inventory → Produk → Import** a permitted user can:

- **download a template** — `.xlsx` or `.csv`, with a worked example already in it;
- **upload a filled-in file**, `.xlsx` or `.csv`, and see every problem in it at
  once, addressed by the row number Excel shows in its own gutter;
- **create the lot** — standalone products and variant families, with opening
  stock, in one pass.

Bundles are not importable. A bundle references components that may not exist
yet when its row is read, which needs a second pass; the form stays the way in.

## The three steps are derived, not stored

No sheet → step 1. A sheet with no result → step 2. A result → step 3.

A `step` in state alongside `sheet`, `preview` and `result` is a fourth variable
that can disagree with the other three, and the screen it produces when it does —
step 3 with no result — is a blank panel nobody can explain.

## Two formats, one set of rules

`.csv` is parsed in `sheet.ts`; `.xlsx` goes through SheetJS. **Both meet at
`parseGrid`**, so every decision about columns, row numbers and blank cells is
written once and cannot come out differently depending on which button the user
pressed in Excel's Save As dialog.

### The SheetJS build is not the one on npm

`xlsx` on the **npm registry is an abandoned artefact frozen at 0.18.5**, carrying
a live prototype-pollution advisory. The maintained line moved to
`cdn.sheetjs.com`, and that is what `package.json` points at:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

`package-lock.json` records an integrity hash, so `npm ci` verifies the tarball
like any other dependency. `npm audit` reports nothing for it — the six
high-severity findings in this repo are all pre-existing and elsewhere.

> **Do not "fix" the unusual dependency URL by installing `xlsx` from npm.** It is
> a one-line change that reintroduces a known hole into a parser that runs over a
> file the tenant was handed by a supplier.

The one real cost is an install that depends on `cdn.sheetjs.com` being reachable.
A CI without a warm npm cache and without access to that host cannot build the
app at all — worth knowing before it happens on a deploy.

### It is loaded only when it is needed

A dynamic `import("xlsx")` inside `readWorkbook`, so the ~800 KB parser is fetched
by the user who actually picked a workbook and stays out of the bundle every other
screen pays for. If the chunk never loads — offline client, proxy that blocked the
asset — the user is told to save as CSV instead, which is a path that needs nothing
but the code already running.

### `.xlsx` is the better format here, and the reason is dates

Excel stores a date as a **serial number** — `2027-08-01` is 46600 — so the
workbook knows which part is the month. The DD/MM ambiguity that forces the CSV
reader to refuse `01/08/2027` simply does not arise.

The serial is rendered with `SSF.format`, which is **arithmetic on the serial and
never builds a `Date`**. That matters more than it sounds: every route through a JS
Date is a route through the runtime's timezone, and a user in Jakarta entering the
1st would otherwise have a fair chance of storing the 31st.

Numbers use the **raw** value, never the displayed one: `cell.w` for a price
formatted as currency is `Rp45.000,00`, which the decimal reader would then refuse
— a user rejected for formatting their own spreadsheet.

### Two template downloads, built from one source

The server serves **CSV and only CSV** — one endpoint, one place where the column
list lives. The `.xlsx` is built in the browser from that CSV
(`utils/templateWorkbook.ts`), so a column added, renamed or reordered server-side
appears in both downloads with no change on the frontend. What this side knows is
only how Excel should *format* each column, never which columns exist.

**One button, two formats behind it.** "Unduh template" opens a menu with `.xlsx`
and `.csv`; the `.xlsx` entry is marked *disarankan* and says why in one line. Two
equal-looking buttons would have left the user choosing on the strength of a file
extension, and the choice is not cosmetic — see below.

**And the `.xlsx` is the right default, not for tidiness.** A CSV cannot carry a column
format, and two columns lose data without one:

| Column | Without a format | With one |
| --- | --- | --- |
| `barcode` | `0123456789012` typed into a General column is a *number*: Excel drops the leading zero and renders 13 digits as `8.9927E+12`, both before any code of ours runs | Text (`@`) — the digits survive exactly as typed |
| `tgl_expired` | a text date, which `readDate` has to refuse outright when it is ambiguous | a real date column, so Excel stores a serial and the month is never in doubt |

`sku`, `parent_sku`, `kode_batch` and every `attr_*` column are Text for the same
reason as `barcode`. Prices stay numeric, so a user can still sum them in their own
sheet.

**The stub rows are load-bearing, not decoration.** Excel applies a format to the
cell being typed into, not to the column as a concept — so a barcode entered on row
40 of an otherwise unformatted sheet is a number again. The template pre-formats 200
empty rows, which is what makes the guarantee real rather than a property of the two
example rows. Past that the user is pasting a block, which carries its own formatting.

`cellStyles: true` is required on the write, and it is the one flag whose absence
would make this whole file pointless while still producing a perfectly valid
workbook — which is why the tests read the formats back rather than asserting the
blob is non-empty.

### The grid is aligned to Excel's gutter

`readWorkbook` reads from row 0 and column 0, not from the sheet's own used range.
A workbook whose data begins at A3 — two blank rows the user left at the top —
would otherwise produce row numbers off by two, and the row number is the one thing
the user navigates by. `parseGrid` then finds the header wherever it actually sits,
which fixes the same class of problem for CSV.

Only the **first sheet** is read. When a workbook has more than one, the screen
names the sheet it used, so a tenant whose data is on sheet 2 gets an explanation
rather than a missing-columns error.

### SheetJS does not reject garbage

Worth writing down because it looks like a gap: handed bytes that are not a
workbook, 0.20.3 returns a sheet made of nonsense instead of throwing. So the
`catch` around `XLSX.read` is **not** what protects the wrong-file case — the
required-column check is, and *"Kolom wajib tidak ditemukan: sku, harga_jual.
Unduh templatenya dan isi di situ"* is the more useful message anyway. The catch
stays for the narrower class SheetJS genuinely refuses: encrypted workbooks and
structurally broken containers.

## The CSV reader is where the traps are

`features/inventory/utils/sheet.ts`. Not a CSV library — the mirror of the
backend's `utils/csv.js`, which says the same thing about writing. What it
implements is the whole of RFC 4180 a real spreadsheet export produces, plus the
things a real spreadsheet export does that RFC 4180 says nothing about:

| | |
| --- | --- |
| **Semicolons** | Excel writes CSV with the system list separator, and on an Indonesian locale that is `;`. Parsed as commas the file is one column, every header is unknown, and the error names a column the user can see perfectly well in front of them. Sniffed from the header line. |
| **Quoted fields** | `"Royal Canin, Adult"` is one name. Splitting on the delimiter turns one row into two columns of nonsense that still parse. |
| **Doubled quotes, embedded newlines, CRLF, BOM** | All of them, because all of them turn up. |
| **Grouped thousands** | `1.250.000` and `1,250,000` are stripped. A user who typed a good price should not be refused over punctuation their spreadsheet inserted. |

### Two things it refuses to guess

**Dates.** Only `YYYY-MM-DD` is accepted **from a CSV**. `01/08/2027` is the 1st of
August in Jakarta and the 8th of January in New York, and this cell decides when a
batch of cat food comes off the shelf — a parser that picks a reading will
eventually pick the wrong one, silently, which is precisely the failure the column
exists to prevent. The refusal names the format *and* tells the user to set the
Excel column to Teks, because that is the actual fix and nobody guesses it.

This is a CSV problem only. Upload the `.xlsx` and the workbook's own serial number
answers the question — which is the strongest practical argument for doing so.

**Prices with currency on them.** `Rp 45.000,-` is refused rather than repaired.
Stripping the decoration would be inventing a price, and this is the number every
invoice is built from.

## Column names stop existing at the parser

Above `sheet.ts` everything speaks the API's field names (`sellPrice`,
`openingCost`); the sheet speaks `harga_jual` and `hpp_awal`. Keeping the two
vocabularies apart is what lets a column be renamed for legibility without
touching an API payload — and it is why problems from the parser name the
**column** while the server's name the **field**.

`attr_*` is the one variable part. The header after the prefix becomes the axis
name, **cased as the header wrote it**: `attr_Ukuran` becomes an attribute called
Ukuran, because that string ends up stored and rendered as a POS label.

## An unknown column is reported, never dropped

A silently-ignored `hpp_awl` is how a whole catalogue is imported with no cost
basis: every row passes, the products are created, and the balance sheet is wrong
in a way nobody looks for. The screen names them.

## Why the client validates anything at all

The server is the authority and this screen decides nothing about the data — not
whether a SKU is free, not whether a category exists, not whether a family agrees
with itself. All of that is answered once, server-side, and rendered here.

The exception is cell **format**, and it exists for a specific reason: a cell that
is not a number, not a date and not a known unit is refused by the API's Joi layer
as a **request-level 400**, which names no row. One mistyped cell in five hundred
would come back as "Validation failed" and send the user through the whole file by
hand — the workflow this feature exists to end.

So three format rules are duplicated: is it a number, is it `YYYY-MM-DD`, is it a
known unit. No business rule is. And the direction is one-way:

> **A local problem can only ever make the commit button more disabled, never
> less.** A cell the parser could not read was never sent, so the server's
> verdict for that row is uninformed and must not outrank it.

## The gate belongs to the server

`canCommit` comes from the preview response and is passed through untouched. The
client does not re-derive it from the counters — and the commit is refused
server-side regardless, because a preview is a screen and a screen is not a
permission.

A refused commit **clears the preview**. The catalogue moved between the two
screens, so the green rows on display are the stale reading that let the commit be
attempted; leaving them up would show a refusal beside a table saying everything
is fine.

## The report is a report, not a success screen

Three outcomes a green tick would render identically:

1. **everything created** — the ordinary case;
2. **`failed[]` non-empty** — something raced the import. Everything predictable
   was refused before any write, so these are collisions that happened *during*
   it. The panel says the rest is already in, because the instinct is to re-run
   the whole file;
3. **`openingStockPosted: false`** — the product exists and its stock does not.
   The backend deliberately does not fail a create when the ledger refuses the
   opening balance, and over five hundred rows this is invisible unless it is on
   screen. Re-importing is never the fix: the SKU now exists and would come back
   as `conflict`.

**These are three outcomes, not two**, and treating the last as a kind of failure
was a real bug: a run where nothing failed but some stock did not post rendered as
*"selesai sebagian … 0 gagal"*, which contradicts itself and points at a failure
that never happened.

### The commonest cause, and why the obvious repair is wrong

`Chart of accounts is missing account 3101` — the tenant has no **3101 Modal /
Saldo Awal**, which is the credit side of an opening balance. It is in
`defaultAccounts.js` and seeded on tenant creation, so a tenant that predates the
COA module never received it. `node src/seeds/backfillAccounts.js` on the backend
adds it; the script is idempotent and touches nothing a tenant edited.

The panel names the chart of accounts **before** the adjustment screen when the
error mentions a missing account, and says why:

> a manual adjustment credits **4901 Pendapatan Lain-lain** — it books the goods as
> a *gain*. Right for stock found in a count, wrong for stock the owner already had
> on day one, which is capital and belongs against 3101.

Sending the user to the adjustment form there would file a tenant's entire starting
inventory as profit, which is precisely what the `opening_balance` movement type
exists to prevent.

### One `<p>`, always

`AlertDescription` is a `grid gap-1`, so **every element child becomes its own grid
row** — a bare `<strong>` in that slot lands on a line of its own and the sentence
visibly comes apart. Messages are wrapped in a single block for that reason.

## Retrying

There is no idempotency key to send and none is needed: the SKUs created by a
first attempt come back as `conflict` on the next preview, and the batch is
refused before anything is written twice. Re-upload the same file, delete the rows
marked *Sudah ada*, upload the remainder.

## Permissions

The page and both write calls are gated on **`products:create`**. The template is
`products:read` on the server, deliberately more open — but no route serves only
the template, so the page carries the stricter of the two.

The toolbar entry point sits inside the existing `Can feature="products"
action="create"` block, so a role without it never sees the button; the route's
`RequirePermission` covers direct URL entry.

## Files

**Types** — `types/productImport.ts`. Its own file rather than a corner of
`types/inventory.ts`: a product and a lot are documents, a row and a verdict exist
for the length of one upload.

**Service** — `services/productImport.service.ts`. Three calls, three timeouts —
the commit gets 180s, because five hundred products is a minute of sequential
transactions and a client that gives up abandons an import that is still running.

**Parser** — `features/inventory/utils/sheet.ts`. **Template builder** —
`features/inventory/utils/templateWorkbook.ts` (CSV → formatted `.xlsx`; it borrows
`splitCsv`/`sniffDelimiter` from the parser rather than growing a second idea of
what a quoted field is).

**Hook** — `useProductImport` (the state machine, and the merge of server verdicts
with local problems).

**Components** — `ImportScreen`, `ImportDropzone`, `ImportPreviewTable`,
`ImportResultPanel`.

**Route** — `/dashboard/inventory/products/import` (`create`).

**Tests** — `tests/sheet.test.ts` (48, mostly about readings the parser must not
invent; the workbook cases round-trip through a real SheetJS-built `.xlsx` rather
than a mock, because what is in doubt is what SheetJS hands back for a date, a
currency-formatted price and a boolean), `tests/templateWorkbook.test.ts` (14,
including the download-then-upload round trip that proves a leading-zero barcode
survives), `tests/ImportScreen.test.tsx` (20).

## What this screen deliberately does not do

- **No "skip the bad rows".** All rows must be clean. A partially imported file is
  a catalogue whose gaps nobody can enumerate afterwards.
- **No inline editing of the preview.** The fix belongs in the spreadsheet, which
  is the document the user will keep. Editing here would produce a catalogue that
  no longer matches the file it came from.
- **No per-row warehouse.** One warehouse for the file, chosen once. A column would
  hold the same value five hundred times and offer five hundred chances to
  misspell it. The bazaar case gets an *override* later, not a replacement.
- **No progress bar during commit.** The API answers once, at the end. A bar that
  is really a spinner tells the user something the server never said.
