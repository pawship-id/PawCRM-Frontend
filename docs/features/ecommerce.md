# E-commerce (Shopee) — V1

Penjualan › E-commerce: connect a Shopee shop, upload its mass-update template, bind Shopee SKUs to
Buloo products, export stock back as the same template with the Stok column filled, import orders
as invoices, and import payouts to settle them.

Plan and BO decisions: `PLAN-Ecommerce-Shopee-V1.md` (workspace root). Backend contract:
`PawCRM-Backend/docs/ecommerce-shopee-v1.md`.

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
  store linking to its Pengikatan SKU, a "Hubungkan toko" card, Tokopedia and TikTok Shop as "Segera
  hadir", and Riwayat (`DataTable`; a row opens `HistoryDetailDialog` with Unduh ulang). The mockup's
  sales, payout and held-order panels come with Tahap B/C.
- **Pengikatan SKU** — a store with no template opens on `TemplateDropzone`. Otherwise: `FilterBar`
  with the store picker, Status (with counts) and search; "Perbarui dari template Shopee"; the table
  (Varian Shopee, SKU Buloo, Harga Shopee, Stok Buloo with "dikirim N", Status, Ikat/Ubah). Unbound
  rows first.
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
  / Faktur tidak ditemukan / Sudah lunas, the journal to be posted) → Selesai (PMT number).
- **Ringkasan** also shows Belum cair, Pesanan tertahan, the held-order table (Ikat SKU) and Perlu
  tindakan (orders Batal after invoicing, with what to do). **Pengaturan** adds Impor pesanan
  (statuses, `CheckRow`) and Akun (a picker per posting role).
- **Faktur** — source chip and filter "Shopee"; the detail shows "Shopee · toko", No. referensi and
  Pencairan, hides Ubah and Catat pembayaran, and warns when Shopee cancelled the order.

## Permissions

`ecommerce`: `read` (every screen), `manageStores` (connect, settings, template upload), `bindSku`
(Ikat / Lepas), `export` (Ekspor stok), `importOrders` (Impor pesanan), `settle` (Impor pencairan). Controls a
role cannot use are hidden with `Can`.

## Not in V1 (BO, 28 Oct 2026)

Price management from Buloo, match suggestions and "Terima semua saran", per-export warehouse,
bundles — see the plan's V2 list.
