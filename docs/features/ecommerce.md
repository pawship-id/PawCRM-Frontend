# E-commerce (Shopee, TikTok Shop / Tokopedia) — V1

Penjualan › E-commerce: connect a Shopee shop or a TikTok Shop store (one store for the TikTok app
and Tokopedia — one Seller Center), upload its mass-update template, bind Shopee SKUs to
Buloo products, export stock back as the same template with the Stok column filled, import orders
as invoices, and import payouts to settle them.

Plan and BO decisions: `PLAN-Ecommerce-Shopee-V1.md` and `PLAN-Ecommerce-TikTok-V1.md` (workspace
root). Backend contract: `PawCRM-Backend/docs/ecommerce-shopee-v1.md` and `ecommerce-tiktok-v1.md`.

**Per marketplace.** `MARKETPLACE_PROFILES` / `marketplaceProfile()` in `labels.ts` holds the words
(Shopee / TikTok), the statuses an import may invoice, where each file is downloaded, the customer
and Saldo names. Screens read the store's `marketplace` and never hard-code "Shopee".

---

## Routes

| Route | Screen |
| --- | --- |
| `/dashboard/ecommerce-sync` | `EcommerceSummaryScreen` — Ringkasan |
| `/dashboard/ecommerce-sync/sku` | `SkuBindingScreen` — Pengikatan SKU |
| `/dashboard/ecommerce-sync/settings` | `StoreSettingsScreen` — Pengaturan |

All three wear `EcommerceHeader`: `SalesModuleHeader` with three actions — **Impor pesanan**
(`OrderImportDialog`), **Ekspor stok**, **Impor pencairan** (`SettlementImportDialog`) — then the
sub-tabs as a second `PageTabs` row (the Membership sub-tab pattern). Gate: `RequirePermission
feature="ecommerce"`.

**Which store.** `?store=<id>` (from the page) wins, then the store last picked in this browser tab
(`sessionStorage`, `useSelectedStore`), then the first store. The tab links carry no query —
`PageTabs` marks the current tab by path.

---

## Screens

- **Ringkasan** — three `StatTile`s (Varian terikat, Belum terikat, Ekspor stok terakhir), a card per
  store linking to its Pengikatan SKU, a "Hubungkan toko" card (Shopee · Tokopedia & TikTok Shop), and
  Riwayat (`DataTable`; a row opens `HistoryDetailDialog` with Unduh ulang). The mockup's
  sales, payout and held-order panels come with Tahap B/C.
- **Pengikatan SKU** — a store with no template opens on `TemplateDropzone`. Otherwise: `FilterBar`
  with the store picker, Status (with counts) and search; "Perbarui dari template Shopee"; the table
  (Varian Shopee, SKU Buloo, Harga Shopee, Stok Buloo with "dikirim N", Status, Ikat/Ubah). Unbound
  rows first, those with a saran leading. A saran comes from the template upload (SKU that differs only
  in case or symbols, or the name; rules in the backend doc) and binds nothing until **Terima**, **Pilih
  lain** or **Terima semua saran**.
- **Ikat SKU** — `BindSkuDialog`, a dialog rather than the mockup's drawer (no drawer exists, and the
  mockup itself says not to add one). Product search is server-side, `holdsStock: true`, opening on
  the Shopee SKU. A bind can move several listings (one SKU on two Shopee products); the screen
  reloads when it did. Lepas ikatan goes through `ConfirmDialog`.
- **Ekspor stok** — `StockExportDialog`: Pilih toko → Tinjau (clickable counts, preview table) →
  Selesai (downloads; "Unduh lagi"). Only active stores with a template are offered. No warehouse
  override and no new template inside the dialog — both V2.
- **Pengaturan** — `FormActionBar` + `Card`: name, status, gudang sumber, buffer. Cabang, Shop ID
  and the Shopee username (locked by the first payout report) are read-only.
- **Impor pesanan** — Upload (toko, file, status yang diimpor) → Tinjau (Baru / Perlu tindakan /
  Sudah ada / Dilewati, clickable) → Selesai (faktur dibuat, links). Nothing is saved before Simpan.
- **Impor pencairan** — Upload (toko, file, "Dana masuk ke") → Tinjau (total check, Cocok / Selisih
  / Faktur tidak ditemukan / Sudah lunas, the journal to be posted, summed) → Selesai (PMT number).
  Each invoice gets its own payment and journal; the PMT groups them. A payment is cancelled like a
  manual one, never edited, and the PMT marks that row Dibatalkan.
- **Ringkasan** also shows Belum cair, Pesanan tertahan, the held-order table (Ikat SKU) and Perlu
  tindakan (orders Batal after invoicing, with what to do). **Pengaturan** adds Impor pesanan
  (statuses, `CheckRow`) and Akun (a picker per posting role).
- **Faktur** — source chip and filter "Shopee"; the detail shows "Shopee · toko", No. referensi and
  Pencairan, hides Ubah, and warns when Shopee cancelled the order. Catat pembayaran, Riwayat
  pembayaran and void behave as on a manual invoice; the payment discharges Piutang Marketplace. A
  later payout marks an invoice paid by hand Sudah lunas and books nothing for it; a part-paid one
  settles its remainder as Selisih.

## Permissions

`ecommerce`: `read` (every screen), `manageStores` (connect, settings, template upload), `bindSku`
(Ikat / Lepas), `export` (Ekspor stok), `importOrders` (Impor pesanan), `settle` (Impor pencairan). Controls a
role cannot use are hidden with `Can`.

## Not in V1 (BO, 28 Oct 2026)

Price management from Buloo, per-export warehouse, bundles — see the plan's V2 list.

## TikTok Shop / Tokopedia (5 Nov 2026)

- **Hubungkan toko** — Marketplace picker (Shopee / Tokopedia & TikTok Shop); Saldo account named
  "Saldo TikTok – <toko>".
- **Pengikatan SKU** — "Varian TikTok", the SKU Penjual with the ID SKU under it; Ikat SKU shows
  both. Binding is by SKU Penjual.
- **Ekspor stok** — the `Kuantitas` column, capped at 999.999; upload path in TikTok Seller Center.
- **Impor pesanan** — status column "Status TikTok", the app (Tokopedia / TikTok Shop) under the
  order number; customer "Tokopedia & TikTok Shop – <toko>".
- **Impor pencairan** — total named "Jumlah penyelesaian pembayaran", Riwayat penarikan shown as
  information, two more chips: **Batal, tanpa faktur** and **Penyesuaian**; commit reads "Lunasi N
  faktur + M penyesuaian". A warning when the report looks like another shop's.
- **Pencairan detail** — adjustment rows (no invoice, payment opens the Kas & Bank transaction).
- **Pengaturan** — TikTok statuses; Akun without Voucher, with Komisi afiliasi and Biaya iklan (both
  on Biaya program by default).
- **Faktur** — source "TikTok" (chip and filter), "TikTok · toko · Tokopedia" on the detail.
