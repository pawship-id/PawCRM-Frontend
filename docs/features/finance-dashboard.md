# Keuangan dashboard

`/dashboard/keuangan` — where the money went this period, and the last ten transactions
that moved it.

The landing screen of the Keuangan module. It replaced `AccountingHub`, whose two link
cards duplicated the sidebar, and now leads with the four figures somebody opens the
module for.

| | |
| --- | --- |
| Screen | `features/accounting/components/FinanceDashboardScreen.tsx` |
| Controls | `FinanceDashboardToolbar.tsx` |
| Data | `hooks/useFinanceDashboard.ts` |
| Pure logic | `financeSummary.ts` |
| Service | `services/journalEntry.service.ts` |

---

## What it reads, and why it is three calls

| Call | Answers |
| --- | --- |
| `GET /journal-entries/summary` | Total Revenue, Total Expense, Net Profit, the margin chips |
| `GET /journal-entries/balances` | Saldo Kas & Bank |
| `GET /journal-entries?limit=10` | the transaction table |

**The two aggregates exist so this screen does not fold the ledger itself.** It used to:
every figure was a sum over `JournalEntry[]`, because the API offered no other way to ask.
Against a real tenant posting per-transaction POS that is 3 000–6 000 entries a month —
thirty-odd requests to draw one card, re-run on every filter change, with the arithmetic
done in a browser on money. Both endpoints landed in backend 0.39.0; the reasoning is in
[`PawCRM-Backend/docs/finance-dashboard-gaps.md`](../../../PawCRM-Backend/docs/finance-dashboard-gaps.md).

`summary` and `balances` are **not** the same question. The first is a period figure, the
second is a **position as of a date** — so `balances` is called with `asOf = dateTo` and
never with the range's start. A version that took both would return a movement wearing the
word "balance", which is the one thing a cash figure must never be mistaken for.

### What the client still computes

Two things, both display-level:

- **the transaction projection** (`financeTransactions`) — a reshape of ten records that
  encodes a presentation decision: a POS sale is ONE row showing the revenue, not two
  showing revenue and its cost. An endpoint that made that choice would make it for every
  future client;
- **margins** (`marginPct`) — net ÷ revenue, in BigInt minor units, to one decimal.

Everything else comes down the wire.

---

## Filters

Three fields on a quick bar: **Periode**, **Cabang**, **Lini bisnis**. All single-select,
each applying on its own terms — [ui-rules §8](../ui-rules.md).

**Lini bisnis is singular**, where the original mockup had a multi-select. The API filters
one line at a time, and the alternative — a summary request per selected line, added up
here — would put the arithmetic back in the browser that the endpoint exists to take out.
It is also unnecessary: the *unfiltered* call already returns the full per-line split, so
"compare the lines" is answered by reading the chips rather than by selecting several.

**The period is never a chip and never counted.** Every figure on this page is a figure
*for a period*; the range is not narrowing the dashboard, it is what the dashboard means.
Cabang and lini bisnis genuinely narrow, so both get chips and both are what "Hapus semua"
clears.

**Dates are calendar dates, sent as the user picked them.** The server expands them to
whole days in the tenant's own timezone (`tenants.timezone`, default `Asia/Jakarta`) — so a
client that helpfully converted to UTC first would shift the period by a day.

### The `__none__` token

Filtering to "Bersama (HQ)" means *the lines with no business line on them*, which no id can
express and the API does not accept. The toolbar uses a client-side token; the screen strips
it before the query leaves, and the shared bucket is read off `byBusinessLine` instead. The
row is always there — the parts sum to the whole.

---

## Where the period does not reach

Both are stated on the cards themselves, because a caveat nobody reads is not a caveat:

- **Saldo Kas & Bank ignores the start of the range.** It is a position as of the end.
- **Picking a lini bisnis narrows the P&L only.** A rupiah in the bank belongs to the shop
  rather than to grooming or retail, so the cash card does not move.

---

## Failure and permission

**A failed request is never rendered as zeroes.** Somebody quotes the number on this screen,
and a business that "earned nothing" because a request timed out is the worst thing this
page could do. A ledger failure replaces the cards with an error and a retry.

**A missing lookup degrades instead.** `/branches`, `/business-lines` and the COA tree are
fetched with `Promise.allSettled`, and a user holding `journalEntries:read` without
`businessLines:read` gets a dashboard whose chips read as ids rather than no dashboard.

**`useFinanceDashboard` takes `enabled`.** The permission check lives in the component and a
hook cannot be called conditionally, so it is told: without `journalEntries:read` it fetches
nothing, and the screen says why. Calling it anyway would fire three requests guaranteed to
be refused, on every page load.

---

## `now` comes from the server

The default period is "this month", and the month has to be decided somewhere. A client
component reading the clock while rendering disagrees with the HTML the server sent — a
hydration mismatch, and near a month boundary a genuinely different answer.

So `page.tsx` computes it, passes it down, and carries `export const dynamic =
"force-dynamic"`: prerendering the page would freeze that month at build time, which is
worse than either failure.

---

## Two things the cards refuse to claim

**Net Profit stays neutral when revenue is zero.** A period with no sales still has a net
profit arithmetically: an inventory surplus credits 5201 Kerugian Persediaan, expense goes
negative, and `0 − (−1.105.100)` is a positive number. Painting that green claims a profit
nobody earned — and on a tenant still being set up it is *every* period. The card keeps the
figure, drops the colour, and says "Belum ada pendapatan di periode ini". The condition is
`marginPct(...) === null`, which is true exactly when revenue is zero.

**A negative Total Expense explains itself.** It is legitimate — a stock surplus and a
supplier credit note both credit an expense account — but rare enough that seeing it bare
reads as a bug. The hint names the likely cause instead of leaving somebody to ask.

---

## Known limits

**Revenue is Rp 0 against a real tenant today.** Nothing in the backend posts revenue to the
ledger — there is no POS module, no customer invoice and no payment receipt, so every entry
in a real tenant's books is on the buying side. That is gap 1 in the backend's gap doc, it
is a module rather than an endpoint, and it is the single thing standing between this screen
and a true picture. Manual entries (`POST /journal-entries`) work end to end, so a tenant
recording a daily sales recap by hand gets a correct P&L in the meantime.

**"Lihat semua" points at Jurnal Umum.** `/keuangan/transaksi` does not exist yet; the link
moves when it does.

**Only P&L entries appear in the table.** A goods receipt and a supplier payment are real
transactions, but neither is income or expense, so a row for them would need an empty "Tipe"
column. Stated in the table's own footer, and the complete list is one click away.

---

## Related

- Backend gaps and what closed them —
  [`finance-dashboard-gaps.md`](../../../PawCRM-Backend/docs/finance-dashboard-gaps.md)
- The ledger the figures are folded from — `features/accounting/components/JournalEntriesScreen.tsx`
- Money handling — `utils/decimal.ts`. Amounts are decimal **strings** end to end; nothing
  here touches a float.
