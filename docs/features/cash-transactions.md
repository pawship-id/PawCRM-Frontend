# Transaksi Keuangan

Every numbered movement of money in or out, in one list: receipts against customer
invoices (back office and till), supplier payments, commission payouts, operating
expenses, other income, and till refunds. Decisions and rationale:
`Transaksi-Keuangan-Implementation-Plan.md` in the workspace root. Test script for
BO: `Panduan-Uji-Coba-Transaksi-Keuangan.md`.

## Routes

| Route | Screen | Gate |
| --- | --- | --- |
| `/dashboard/keuangan/transaksi` | `CashTransactionsScreen` — tab **Transaksi** in `AccountingModuleHeader` | `cashTransactions:read` |
| `/dashboard/keuangan/transaksi/new` | `CashTransactionCreateForm` — Pengeluaran / Pemasukan | `cashTransactions:create` |
| `/dashboard/keuangan/transaksi/[id]` | `CashTransactionDetail` — Ubah, Batalkan transaksi | read; the buttons need `update` / `void` |

Code lives in `src/features/cash-transactions/`; the API client is
`src/services/cashTransaction.service.ts`; types in `src/types/api.ts`.

## The list

- **Pill row outside the panel** for Arah: Semua · Masuk · Keluar (applies on click,
  not counted in `Filter (n)`), per ui-rules §8.
- **Panel**: Urutkan (first, not counted), Periode, Jenis, Cabang, Channel, Status.
- **Search** matches number, party, reference, note and the document number — which
  is how a till sale's payments are found: search its invoice number.
- **Deep links** read `?kind=`, `?direction=`, `?status=`, `?documentId=` on the
  server page (Komisi links to `?kind=commission_payment`).
- Cards **Uang masuk / Uang keluar** come from the API's `totals` (posted only, whole
  filter, not the page).

## Numbers

`BKM` / `BKK` for a cash channel, `BBM` / `BBK` for every other type; `…M` money in,
`…K` money out; `BKM/CBS/2609/0001` with the branch code and a monthly reset. The
number **never changes on edit**, which is why the edit dialog only offers channels
of the same class (cash ↔ cash, bank-type ↔ bank-type) — `channelClassOf` in
`labels.ts`.

## Editing and cancelling

- **Ubah** (`CashTransactionEditDialog`, shared with the invoice payment page):
  date, amount (not on expense/other income — edit the lines; not on a commission
  payout), channel (same class), reference, note, lines, reason. The server reverses
  the standing entry and posts a new one; the detail's **Riwayat perubahan** lists
  both journal links per revision.
- **Batalkan transaksi** (`CancelCashTransactionDialog`): a required reason; posts a
  reversal and gives the document back its balance. Close button reads **Kembali**.
- Neither is offered on a cancelled, migrated read-only (`legacy`) or `pos_refund`
  transaction — `lockedReason` in `labels.ts` says why.

## Elsewhere

- `InvoicePaymentDetail`: "Dicatat di kasir / back office", **Ubah pembayaran**,
  **Lihat di Transaksi Keuangan →**.
- `PaymentHistory` (supplier bills): payment number, "dibatalkan", **Buka di Transaksi
  Keuangan →** — supplier payments are corrected there.
- `CommissionRecapScreen`: the pay toast names the number; **Riwayat pembayaran
  komisi** links to the filtered list.
- `FinanceDashboardScreen`: "Lihat semua" goes here when the user can read
  `cashTransactions`, else to the journal.
- `JournalLink` was promoted to `src/components/JournalLink.tsx` (ui-rules §14): the
  sales screens and this feature both use it.
