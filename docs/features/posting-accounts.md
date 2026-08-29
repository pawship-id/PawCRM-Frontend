# Akun jurnal — tiga tingkat

Amandemen PCR-009. Satu pertanyaan — *ke akun mana baris ini diposting?* — dijawab
di tiga tempat, selalu dengan urutan yang sama:

| | Tingkat | Diisi di | Yang mengisi |
| --- | --- | --- | --- |
| 1 | **Akun milik item** | Form produk / jasa → kartu **Akuntansi** | jarang; hanya untuk item yang menyimpang |
| 2 | **Default kategori** | Form kategori → kartu **Akun jurnal** | biasanya sekali, saat setup |
| 3 | **Akun seeded** | tidak diisi siapa pun — `4101` / `4102` / `5101` / `1201` | otomatis, per tenant |

Tingkat 3 bukan opsional. Tenant yang tidak pernah menyentuh salah satu dari dua
tingkat di atasnya memposting persis seperti sebelum tingkat ini ada — itu yang
membuat perubahan ini aman dijalankan di atas pembukuan yang sudah berjalan.

**Satu tingkat pewarisan antar kategori**, anak → induk, untuk field yang
dikosongkan anaknya. Pohon kategori dibatasi dua level, jadi itu keseluruhannya.
Tanpa itu, tenant yang mengisi akun di "Makanan" akan melihat "Makanan Kering"
memposting ke akun bawaan, dan itu terbaca seperti setelannya diabaikan.

## Tiga field, tiga tipe akun

| Field | Tipe yang diterima | Akun seeded |
| --- | --- | --- |
| Akun penjualan | `income` | `4101` Penjualan Barang — `4102` untuk jasa |
| Akun persediaan | `asset` | `1201` Persediaan |
| Akun HPP | `expense` | `5101` HPP |

Tipe ditegakkan di server (`accountResolution.service.js`), bukan cuma disaring di
picker. Pendapatan yang dikreditkan ke akun beban tetap menghasilkan jurnal yang
**balance** — tidak ada yang error, pembukuannya saja yang berhenti berarti — jadi
penolakannya harus terjadi saat katalog disimpan, bukan saat laporan dibaca.

## Di UI

**Kosong adalah keadaan normal**, dan hint di bawah tiap picker menyebutkan apa
arti kosong, bukan membiarkan kolom akun terbaca seperti sesuatu yang terlupa:

- di form produk → *"Kosongkan untuk mengikuti akun default kategorinya."*
- di form kategori tanpa induk → *"Dikosongkan berarti pakai 4101 Penjualan Barang."*
- di form kategori yang punya induk → *"Dikosongkan berarti ikut kategori induknya."*

**Opsi "Ikut kategori" / "Akun bawaan" adalah jalan pulang ke kosong.** Radix
Select melarang `value=""` — string kosong adalah cara ia mengenali field yang
dikosongkan — sehingga tanpa opsi itu, akun yang sudah dipilih tidak bisa
dibatalkan lagi, padahal setiap hint menyuruh mengosongkannya. Lapisan filter
memecahkan masalah yang sama dengan `withAll`; ini trik yang sama dengan kosakata
yang berbeda.

**`chartOfAccounts:read` adalah izin terpisah** dari `products:update` maupun
`categories:update`. Peran yang mengurus katalog tanpa melihat pembukuan itu
lumrah, jadi penolakannya meruntuhkan satu kartu saja — form tetap bisa disimpan,
dan pesannya menyebut status apa adanya (403 satu-satunya yang benar-benar soal
izin) alih-alih mendiagnosis.

## File

- `features/categories/components/CategoryPostingAccounts.tsx` — tiga picker milik
  kategori, memuat chart-nya sendiri.
- `features/inventory/components/ProductForm.tsx` → kartu **Akuntansi** — tiga
  picker milik produk, dari `useCatalogLookups({ withAccounting: true })`.
- `features/inventory/hooks/useCatalogLookups.ts` — `salesAccounts` /
  `inventoryAccounts` / `cogsAccounts`, satu request per tipe akun.

Sisi server: `src/services/accountResolution.service.js` di backend adalah satu-
satunya tempat urutan tiga tingkat itu dieksekusi. POS dan pergerakan stok
memanggilnya; tidak ada modul yang menyalin urutannya.
