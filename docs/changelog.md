# Changelog

All notable changes to the PawCRM frontend.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — Badge diskon kasir menyebut angka yang salah

**Perbaikan bug, ditemukan saat uji regresi diskon.** Badge di tombol diskon
merender `Rp${value.value}` — dua kesalahan sekaligus:

- **angka yang diketik, bukan yang dipotong.** Diskon nominal Rp 110.000 pada
  baris Rp 100.000 dibatasi jadi Rp 100.000, tapi badge tetap menyebut 110.000.
  Barisnya bilang "−Rp 100.000", badge di sebelahnya bilang 110000 — dua angka
  untuk satu diskon, dan yang lebih besar justru di tempat yang menarik mata.
- **tanpa format.** `110000.0000` — skala Decimal128 mentah. Itu bentuk
  penyimpanan, bukan sesuatu yang dibaca kasir.

Sekarang mode nominal menampilkan `formatMoney(resolvedAmount)`, dan mode persen
tetap persen — "10%" yang disepakati dengan pelanggan, rupiahnya sudah ada di
baris atasnya.

**Satu jebakan di perbaikannya sendiri:** trim nol-di-belakang yang naif
(`/\.?0+$/`) ikut memakan nol pada "100.0000" dan mengubah **100% jadi 1%**. 100%
adalah diskon yang nyata — barang pengganti, kompensasi. Sekarang hanya nol di
bagian desimal yang dibuang, dan ada tesnya khusus untuk itu.

`PosDiscountPopover` sebelumnya tidak punya tes sama sekali; sekarang 6.

## [Unreleased] — Error di form cabang jadi toast

Diminta langsung. **Penyimpangan sengaja dari `docs/ui-rules.md` §9**, dicatat di
header kedua komponen: form cabang panjang dan bisa di-scroll, jadi `409` kode
cabang muncul saat kursor ada di tengah halaman — dan Alert yang menempel di atas
form adalah pesan yang tidak akan dilihat oleh orang yang menyebabkannya.

**Error per-field tetap di bawah field-nya.** Itu memberitahu kotak mana yang
salah, dan toast tidak bisa menunjuk kotak. Yang dipindah hanya penolakan tingkat
form yang memang tidak punya field untuk ditempeli.

Penolakan server dapat timer **8 detik**, bukan 3 — ia membawa instruksi, dan tiga
detik tidak cukup untuk membacanya lalu bertindak.

Pesan validasi cabang diterjemahkan ke Bahasa (§12 mengikat; §15 sudah mencatat
layar cabang sebagai utang terjemahan). Hint kode cabang sekarang menyebut batas
8 karakternya di depan.

---

## [Unreleased] — Cabang punya Kode, dan kode itu masuk ke nomor faktur

Pondasi PCR-030. Belum ada layar faktur baru; yang berubah satu isian di Master
Data.

**Master Data → Branch dapat isian "Kode cabang"** di form tambah dan ubah.
Isinya masuk ke nomor faktur cabang itu — `INV/CBS/2608/0001` — dan sengaja
**tidak** diturunkan dari namanya: cabang bisa diganti nama, dan faktur yang sudah
terbit harus tetap memakai nomor yang sudah terlanjur disebut ke pelanggan.

**Dijadikan huruf besar sambil diketik**, bukan diam-diam saat disimpan. Server
juga menjadikannya huruf besar, jadi keduanya tersimpan sama saja — tapi kolom
yang mengubah isinya sendiri setelah orang berpaling terbaca seperti bug, dan yang
sedang mengecek nomor fakturnya harus melihat persis string yang akan tercetak.

**Boleh dikosongkan.** Setiap cabang yang sudah ada belum punya kode, dan kolom
wajib akan membuat semuanya tidak bisa disimpan. Cabang tanpa kode tetap bisa
menjual piutang — nomornya jadi tiga segmen, `INV/2608/0001`.

**Labelnya Bahasa** meskipun form cabang di sekitarnya masih Inggris. Itu
mengikuti `docs/ui-rules.md` §12 yang mengikat, dan §15 sudah mencatat form cabang
sebagai utang terjemahan — aturannya menang atas berkas tetangganya.

---

## [Unreleased] — Akun jurnal per kategori, dan jalan pulang ke "kosong"

Amandemen PCR-009 dari sisi UI. Aturan lengkapnya di
[`docs/features/posting-accounts.md`](./features/posting-accounts.md).

**Kategori sekarang punya kartu "Akun jurnal"** — Akun penjualan, Akun persediaan,
Akun HPP — tingkat kedua dari tiga. Alasannya: mengatur akun per produk itu benar
tapi tak terpakai; toko dengan empat ratus SKU di Makanan, Treats dan Perlengkapan
ingin tiga jawaban, bukan empat ratus. Produk tetap bisa menimpanya satu per satu.

**Copy-nya berubah begitu kategori punya induk**: "Dikosongkan berarti pakai 4101
Penjualan Barang" menjadi "ikut kategori induknya". Satu tingkat pewarisan, karena
pohonnya dibatasi dua level. Tanpa perbedaan itu, orang yang mengisi akun di
"Makanan" akan membaca "pakai 4101" di bawah "Makanan Kering" dan menyimpulkan
setelannya diabaikan.

**Produk dapat "Akun penjualan"**, dan ketiganya kini punya opsi **"Ikut
kategori"**. Itu perbaikan bug, bukan kosmetik: Radix Select melarang `value=""`,
jadi sebelum ini akun yang terlanjur dipilih tidak bisa dikosongkan lagi — padahal
hint di bawah setiap picker menyuruh mengosongkannya, dan kosong adalah yang
membuat tingkat kategori berlaku.

**Mock yang berbohong, diperbaiki.** `chartOfAccountsService.list` di
`ProductForm.test.tsx` menjawab lewat cabang `else`, sehingga permintaan
`accountType: "income"` dilayani dengan akun **aset** — bentuk yang akan ditolak
API. Sekarang dijawab dari tipe yang diminta.

---

## [Unreleased] — Faktur Penjualan: tiga stat card + urut berdasarkan tagihan

Dua acceptance criteria PCR-033 yang terlewat di potongan pertama.

**Tiga kartu, dibaca sebagai satu kalimat**: Total piutang · Lewat jatuh tempo ·
Tertagih <bulan> — berutang, telat, tertagih. Selalu tampil, termasuk saat nol;
kartu yang hilang saat nol mengajari orang bahwa ketiadaannya berarti "belum
termuat". Nilai `null` dirender sebagai em dash, bukan "Rp 0" — yang pertama
berarti bacaannya gagal, yang kedua berarti tidak ada yang berutang.

**Caption bulannya dari rentang milik server**, bukan jam browser. Bulannya
dipotong di zona waktu tenant; menurunkannya di klien akan memberi caption satu
bulan di atas angka yang dihitung untuk bulan lain, beberapa jam di kedua sisi
setiap pergantian.

**Urut "Tagihan terbesar/terkecil"** — berdasarkan `total` yang tersimpan, bukan
sisa tagihan yang diturunkan per baris dan tak terjangkau indeks. Karena itu tidak
ada opsi "Sisa terbesar": ia akan jadi kontrol yang diam-diam mengurutkan angka
lain dari yang disebutnya.

---

## [Unreleased] — Faktur Penjualan: perbaikan dari verifikasi UI

**Id jurnal di riwayat pembayaran diganti nomor jurnal, dan bisa diklik.**
Barisnya dulu berbunyi "jurnal 6a903c1a3d3de99c0994134a" — bukan sesuatu yang
bisa dicari, dikutip, atau dicocokkan. Sekarang `JE-2026-08-0412`, menaut ke
`/dashboard/keuangan/journal-entries/:id`; pembayaran yang dibatalkan menaut
keduanya, entri aslinya dan pembaliknya. Tautannya digating `journalEntries:read`
— tanpa grant itu nomornya tetap tampil sebagai teks biasa, karena itulah yang
dikutip ke orang yang bisa membuka buku besarnya.

**Tombol Simpan pembayaran tidak lagi terkunci selamanya setelah DP.** Kuncinya
dulu hanya dilepas saat gagal, dengan asumsi pembayaran yang berhasil selalu
meng-unmount form-nya — benar hanya untuk **pelunasan**. Setelah pembayaran
sebagian, induknya merender elemen yang sama di posisi yang sama, React menyimpan
state-nya, dan tombolnya berputar sampai halaman di-reload. Terjadi setiap
cicilan. `purchasing/RecordPaymentForm` ditulis lebih dulu dan punya cacat yang
persis sama — ikut diperbaiki.

**Penolakan jadi toast merah di kanan atas**, bukan `<Alert>` di dalam form —
penyimpangan dari [ui-rules §9](./ui-rules.md) yang disengaja dan diminta. Satu
mitigasi untuk harga yang dibayarnya: toast hilang sendiri, jadi penolakan
**server** — yang isinya instruksi seperti "reload dulu" — diberi **8 detik**
alih-alih 3. `swalToast` dapat parameter `timer` opsional; 49 call site lain
tidak berubah.

**Kwitansi tidak lagi mencantumkan id jurnal.** Barisnya berbunyi "dicetak dari …
· jurnal `6a903f15…`" — tidak diminta PRD maupun sheet PCR, dan id database di
dokumen yang dipegang pelanggan hanyalah derau. Id-nya tetap ada di riwayat
pembayaran, yang memang layar staf.

---

## [Unreleased] — Faktur Penjualan: pembayaran bisa dibatalkan, dan ada kwitansinya

`Batalkan` dan `Kwitansi` per baris di riwayat pembayaran. Details in
[`features/customer-receivables.md`](./features/customer-receivables.md).

**Membatalkan bukan menghapus.** Barisnya tetap di timeline, dicoret, lengkap
dengan alasan dan id jurnal pembaliknya. Dialognya mengatakan itu **sebelum**
diklik, bukan setelahnya: pengguna yang mengira barisnya akan hilang lalu
menemukannya masih ada akan menyangka kliknya gagal dan mengulanginya.

**`isVoided` datang dari server.** Layar tidak pernah memutuskan sendiri apa arti
"aktif" — definisinya sama dengan yang dipakai menghitung `paidAmount`.

**Digating `customerInvoices:void`, bukan `pay`.** Peran yang boleh menerima uang
melihat timeline dan tombol kwitansi, tanpa `Batalkan` sama sekali.

**Kwitansi mencetak SATU pembayaran, bukan fakturnya.** Total faktur hanya muncul
sebagai konteks sisa tagihan — mencetak fakturnya akan memberi pelanggan yang
baru bayar sepertiga sebuah dokumen yang angka utamanya justru keseluruhan.
Kop toko diambil dari `useTenant()`, bukan endpoint struk baru. Pembayaran yang
sudah dibatalkan tetap bisa dicetak, dengan tanda — orang mencetak ulang justru
biasanya karena itu.

Mekanik cetaknya memakai ulang `features/pos/print/receipt.css` dan pola
portal-ke-`body` milik struk kasir; stylesheet itu menyimpan dua cara mencetak
dari dalam dialog yang pernah gagal.

---

## [Unreleased] — Sales & Invoice: faktur penjualan bisa dibaca dan ditagih

`/dashboard/sales` stops being a `SectionPlaceholder`. Two screens against
`/api/customer-invoices`: the receivables list with its urgency lens and headline
figures, and one invoice with its payment history and the form that records money
arriving. Details in [`features/customer-receivables.md`](./features/customer-receivables.md).

**This closed a live hole, not a missing feature.** The till has been able to sell
on Piutang since UT-3 — the sale posts `Dr 1103`, raises a receivable and stores
it — and nothing in the product could read that document or record a rupiah
against it. A shop giving credit at the counter tracked the settlement on paper.

**No "Buat faktur" button, deliberately.** There is no `POST /api/customer-invoices`
yet: raising one by hand cuts stock, posts two journal entries and allocates a
number, which is PCR-030. Rendering a button onto a route that does not exist
would be worse than the gap it papers over. Every invoice on the screen today
carries a **dari kasir** chip, and `source` is what will tell them apart from the
manual ones when that form lands.

**Nothing is recomputed in the browser.** `outstandingAmount` and `isOverdue`
arrive computed against one instant for the whole page, and the headline totals
come from `/customer-invoices/outstanding` — the whole book, not the twenty rows
on screen. `isOverdue` in particular folds in "not settled and not void", which a
calendar-only test here would miss: `dueDate` keeps its value after payment, so
every invoice ever paid late would flag.

**One form for DP, cicilan and pelunasan.** No "settle in full" control anywhere —
the status is derived from what has been paid, so `Lunasi` fills the amount box
rather than sending a different request. The submit locks for the whole flight,
because `POST /:id/payments` has no idempotency key and a double-click would book
the money twice on two irreversible entries.

**The channel picker asks for `usableFor: "in"`** — one letter from the payables
form's `"out"`, and the whole difference between where money lands and where it
leaves from.

**The page is named for the DOCUMENT, not for its balance.** It shipped as
"Piutang Pelanggan" and was renamed the same day: every row is a receivable today,
but an invoice is born unpaid and settles later, so that title would contradict
its own **Lunas** pill as soon as settled invoices accumulated — which PCR-030
guarantees. Piutang stays as the default lens (the **Belum lunas** pill) and the
headline figure (**Total piutang berjalan**), which is where it is true. The
component identifiers did not follow the copy — ui-rules §12 splits the two.

**`customerInvoices` joined the frontend permission catalogue**, and the Sales nav
entry is gated on `customerInvoices:read` — it was ungated before, when there was
nothing behind the link to protect. `pay` is separate from `read`: a read-only
role sees the whole invoice and, where the payment form would be, a line naming
the grant it is missing.

---

## [Unreleased] — Booking: bikin, jalankan, dan riwayat statusnya

`/dashboard/booking` stops being a list you can only read. `BookingCreateDialog` takes a
booking — pelanggan, hewan, layanan, jadwal — and `BookingStatusActions` moves one along the
ladder or calls it off, with `BookingHistoryDialog` showing when it reached each status.
Details in [`features/booking-screen.md`](./features/booking-screen.md).

**The till only ever sees the END of a booking**, which is what the read-only table missed:
an animal arriving and a groomer starting were facts nobody could record anywhere. The person
who knows them is the receptionist watching the door, and this is the screen they have open.

**Every move confirms, including the ordinary ones**, because none can be undone — the ladder
runs forward only, so a mis-tapped "Tandai selesai" is not a click somebody takes back. The
dialog is also where the two things worth saying fit: which rungs the jump fills in behind it,
and that completing a booking here is not the same as being paid for it.

**A jump straight to check-in also records the confirmation, at the same minute.** Nobody
hands over a dog for an appointment that was never agreed. The filled-in entry is drawn as
*otomatis*, because two entries stamped at the same second would otherwise claim two separate
decisions.

**The customer is picked through `CustomerSearchDialog`** rather than a `FilterSelect`: it
searches on the server, so the shop with four hundred pelanggan can find the four hundredth,
and it registers a new one without abandoning the half-filled booking. The groomer select
disappears when `/users` is refused — a receptionist has no reason to hold `users:read`, and
assignment is optional.

**Status filters, badge labels and the menu now run in ladder order** — confirmed before
check-in, matching `BOOKING_LADDER` on the server.

## [Unreleased] — Booking Bridge: tarik booking, atau bikin di tempat

`BookingBridgeDialog` and its ad-hoc tab, exported from `@/features/booking`. No route —
the POS cart panel mounts it in Fase 6, and `/dashboard/booking` keeps its placeholder. Fase
4 of the POS module.

**Both tabs are reachable every time** (FR-3), and **which one opens is derived from the
data during render**, not pushed into state by an effect. That is a real bug avoided rather
than a lint rule appeased: an effect that flipped the tab when the fetch landed would, on a
slow connection, move a cashier who had already tapped through — possibly mid-tick. `tab`
starts as `null` meaning "not chosen", and once chosen it wins for the life of the dialog.

**The pull path writes nothing.** `onPull` hands the ticked bookings back; marking them as
pulled belongs to whatever creates the cart, inside the transaction that writes it. A dialog
that did it itself would leave bookings claimed by a cart that was never built — invisible to
the bridge for the rest of the day, for a sale that never happened.

**The ad-hoc tab creates a real booking**, `origin: "pos_adhoc"` and already `confirmed` —
the customer is standing at the counter. One pet per confirmation: a pet × service matrix
submitted at once would have to create several bookings from one form and decide what to do
when the third fails after the first two were written.

**`apiClient` gained array query params.** `buildUrl` stringified every value, so
`status: ["confirmed", "in_progress"]` became `status=confirmed%2Cin_progress` — one value,
which every enum check on the far side rejects. Arrays now become repeated params, which is
what Express parses back into an array. It looks like it works until the first filter that
takes more than one value, so `api-client.test.ts` pins it. See
[docs/features/booking-bridge.md](./features/booking-bridge.md).

---

## [Unreleased] — Cari & daftar pelanggan tanpa keluar dari kasir

`CustomerSearchDialog` and `CustomerQuickAddDialog`, exported from
`@/features/customers`. No routes of their own — the POS cart panel mounts them in Fase 6.
Fase 2 of the POS module.

**Search goes to the SERVER, and that is a departure from every other picker here.**
`PetOwnerField` and the business-line pickers load a page of options and search inside it,
so past the page cap they silently cannot find anyone. A till cannot work that way: the shop
with four hundred pelanggan is exactly the shop that needs this. `?search=` already matched
name, email and phone — verified against the repository rather than assumed.

**The quick-add lives inside the search dialog**, in its empty state, because the moment
somebody discovers a customer does not exist is the moment they need to create one. A term
that reads as a phone number is carried into the form: somebody who typed one has already
entered that field once.

**Phone is required in the dialog and optional in the API.** The contract has to keep
accepting a name-only customer — a clinic recording a walk-in is a real case — but the
reason to quick-add *from the till* is almost always a piutang, and a debtor with no number
is a debt nobody can chase.

**`apiClient` gained `postEnvelope` / `patchEnvelope`.** The duplicate-phone warning arrives
beside `data`, and `post` unwraps to `data` and would have thrown it away. `request` is now
a thin wrapper over an envelope-returning core: the error path always read the full envelope
(that is where `details` and `reason` come from), while the success path discarded
everything else — which made a successful-but-noteworthy response impossible to express. See
[docs/features/customer-quick-add.md](./features/customer-quick-add.md).

---

## [Unreleased] — Kas & Bank: ke mana uangnya masuk

Keuangan → **Kas & Bank**, at `/dashboard/keuangan/kas-bank`. The named places money can
arrive when a cashier takes payment, each mapped to the account it debits. Fase 5 of the
POS module — the last prerequisite before POS core.

Straight after Daftar Akun in the menu, because a channel's whole purpose is the account it
points at: you cannot map one before the accounts exist.

**The MDR field does not exist where no fee is deducted.** Cash arrives whole and a bank
transfer's fee is paid by the *sender*, so only QRIS and EDC can carry a rate. The field is
hidden for the other two rather than shown and refused — a rate there is not a mistake to
allow and then report, it is a field with no meaning. Switching back to a fee-less type
clears a typed rate, because a value left in state would be sent on the next save: a `400`
for something the user can no longer see.

**The server's four business rules bind to their fields**, not to a banner: a non-asset
account, an MDR on the wrong type, a tenant-wide cash channel under per-branch scope, and a
name already used within that tab. The form deliberately does not read `posCashScope` to
pre-validate the third — that would be a second place for the rule to live — so it states
what happens in the hint and binds the refusal when it arrives.

**The account picker only offers live assets**, because the server refuses anything else and
offering the rest would be offering a guaranteed `400`.

**`CHANNEL_TYPE_LABELS` and `CHANNEL_TYPE_ORDER` are exported** from the feature's public
surface, because the POS payment panel will render the same four tabs in the same order
with the same words — and two copies of that list is how the settings screen and the till
start disagreeing about what "EDC" is called. See
[docs/features/payment-channels.md](./features/payment-channels.md).

---

## [Unreleased] — Layanan punya katalognya sendiri

Master Data → **Layanan**, at `/dashboard/master/layanan`, with list, create and edit
screens. What a tenant sells the *doing of* — grooming, penitipan, vaksinasi. Fase 3 of the
POS module.

Placed beside Hewan rather than under Inventory → Produk, because the split is about who
edits: the groomer who prices a bath is not the person pricing sacks of feed, and the RBAC
catalogue makes the same split.

**The price box takes digits only, and refusing the decimal point is the point.** In
Indonesian, `.` is the thousands separator — somebody typing `150.000` means a hundred and
fifty thousand, and read as a decimal it is **150 rupiah**, stored silently with the form
showing exactly what they typed. Allowing sen would not fix it: `150.000` is a valid
three-decimal amount *and* a valid mistyped hundred-fifty-thousand, and no rule reads the
writer's mind. Nothing is lost either, because `formatMoney` rounds to whole units on the
way out — accepting input the UI then hides is worse than refusing it. The first version
validated with `isDecimal` and let it through; a test caught it.

**The price is a string end to end** — typed as text, validated as digits, sent as written,
never `Number()`-ed. `inputMode="numeric"` rather than `type="number"`, because a number
input in some browsers silently reformats what was typed.

**Business-line options are fetched, not spelled out.** A tenant names its own lines, so a
hardcoded list would show the wrong words for everyone who did not call theirs "Grooming".
Capped at the API's 100-per-page limit, the same ceiling `PetOwnerField` documents.

**`durationMin` is collected and read by nothing yet.** Booking will. Adding it afterwards
would mean backfilling every service a tenant already priced, from memory — so the field
goes in now and the card says plainly that nothing uses it today. See
[docs/features/service-catalog.md](./features/service-catalog.md).

---

## [Unreleased] — Hewan punya halamannya sendiri

Master Data → **Hewan**: the register of animals a tenant's customers bring in, at
`/dashboard/master/pets`, with list, register and edit screens. Fase 1 of the POS module
— the Booking Bridge cannot be built without it.

**A pet has two lifecycle axes, and the UI keeps them apart.** `isActive` says the animal
is no longer in the shop's care — it passed away, or was rehomed — while its grooming
history stays true and readable. `deletedAt` says the record should never have existed.
The delete confirmation says as much and points at the switch instead, because
conflating them would force a shop to delete a pet that died in order to stop it
appearing in a booking dropdown, taking its history with it.

**The owner picker is disabled when editing.** `customerId` is absent from the API's
PATCH schema — reassigning an animal would silently move its bookings and invoices under
a different name — so the control does not offer what the server would drop. Its hint
says what to do instead.

**Umur is derived at render time, never stored.** An age written into a record is wrong
the day after it is written. Whole years only: a month-precise age reads as clinical
precision the screen does not have, since a birth date is usually the owner's best guess.

**The customer edit screen gained a Hewan card**, directly above its danger zone. Retired
pets are listed there too — they still belong to that owner, and hiding them would make
the card disagree with the delete guard, which counts them and refuses to remove the
customer. Both places a customer can be deleted now show the refusal's `reason` rather
than its headline: "Cannot delete customer" on its own leaves somebody staring at a button
that will not work.

**`PetQuickAddDialog` ships without a route.** Two fields, and it is exported for the POS
Booking Bridge (Fase 4), which has to register an animal mid-sale — a redirect to the
full form would abandon a half-built cart.

**The owner picker loads 100 customers**, which is the API's page cap rather than a number
chosen here — `pagination` refuses `limit` above it, and refuses rather than clamps. This
field shipped asking for 200 and came back empty with the server's English "Validation
failed" under it, which is the same mistake `chartOfAccounts.service.ts` made when it
landed. `PetForm.test.tsx` now asserts the cap, and the picker shows our own sentence
instead of the server's whatever goes wrong.

Two limits are written down rather than left to be discovered: that 100-customer ceiling,
and the absence of a photo field, because the upload control still lives inside the
categories feature. See
[docs/features/pet-management.md](./features/pet-management.md).

---

## [Unreleased] — Dua kode batch, dan labelnya bisa dicetak

Every screen that opens a lot now shows **two** batch codes, and only one of them can be
typed.

**Kode batch internal (ours) is not a field at all.** It is generated by the server, unique
across the tenant, and it is what gets printed as a barcode and scanned at the till — so a
typed one could name a lot that already exists. It is still *shown*, because whoever is
entering goods has to read it off the screen and write it on the carton; hiding it until
after the save would mean going back to find it.

It is rendered as **text**, in an `<output>`, rather than as the disabled `<input>` it
started as. The input costume was copied from the receipt form's read-only cell for a lot
the user had NAMED, where it kept a column of boxes aligned while the row above typed into
one — and that argument died with the field. Nobody types this column now, so there is no
mixed column to align with, and an `<input>` was charging a real price for nothing: it shows
one line clipped at the box width, and a **disabled** one cannot even be selected to copy.
A code wider than the cell was a code that could not be read, on the one field a label gets
printed from. As text it wraps, so the whole code is on screen at any length.

**Kode batch supplier (theirs) is the field a person fills in.** Optional — most cartons
print no number — and it is what a recall notice will name. `InternalBatchCodeDisplay` and
`SupplierBatchCodeInput` in `@/components` are the one pair all five screens render, so the
distinction is explained once rather than five times: **Terima barang**, **Penyesuaian
Stok**, **Stok Awal**, **Stok Opname** and the **product create** form.

**The code shown is the server's answer where there is one.** Terima barang reads it off
`/goods-receipts/preview`, so the box shows the real code — suffix included — before
anything is saved. The screens with no preview endpoint fall back to a locally derived
*hint*, rendered **muted** where a settled code is rendered in full ink: the code is unique,
so a second lot of the same goods becomes `…-2`, and nothing in the browser knows what is
already taken. That difference in colour is the whole of what tells "this is what it will be
called" from "this is roughly what it will be called".
`lib/batchCode` exports `batchCodeHint` for exactly that, replacing `autoBatchCode`.

**New: `/dashboard/inventory/batches/labels?ids=`** — a printable sheet, one label per lot,
each carrying a Code128 barcode, a QR, the code in figures a human can retype, the product,
the expiry and the supplier's own batch number. A copy count repeats each lot, because the
number somebody wants is one per carton. Reached from a **Cetak label** link on every row of
Batch & Expired. Adds `jsbarcode` and `qrcode`.

**Transfer Stok gained a callout, and it is not decoration.** A lot that moves warehouse is
re-created at the destination under a **new** code — codes are unique, so the arriving row
cannot reuse the source's — which means the carton has to be re-stickered on arrival. The
transfer detail says so and links straight to the label sheet for the lots that landed.

**The supplier's code shows on every surface a lot is described or chosen on**, stacked
under ours where the cell is narrow — the receipt detail, the transfer detail, the
stock-entry detail, the purchase-return detail — and beside it on the one-line surfaces: the
**lot pickers** in Terima barang, Penyesuaian Stok and Transfer Stok, the expiring-lots
widget on the Inventory hub, and the FEFO preview.

**Deliberately NOT on the two long lists**: Batch & Expired and both tabs of the stock card
carry our code only. It had a column there briefly and it did not earn the width — most
cartons print no supplier number, so the column was mostly em dashes on a page that is
already nine columns wide. Recall is still reachable from those screens without it: the
Batch & Expired search box matches **either** code, so typing the supplier's batch narrows
the list to the lots that came out of it.

The pickers are where it earns its place most. Choosing a lot is the act of matching a row on
screen to a carton in somebody's hands, and the number printed on the carton is the
supplier's — ours identifies the row, theirs is what can be read off the box. `lotOptionLabel`
in `lib/batchCode` is the one place that grammar lives, so Terima barang and Penyesuaian Stok
stopped disagreeing about their separator (`·`, never `-`: a hyphen sits inside the codes
themselves, so `VAKSIN-270301 - sisa 8` reads as one broken code).

The Batch & Expired search box matches either code, as well as the product's name and SKU —
which is what keeps a recall workable from a list that shows only one of them.

**The import template's `kode_batch` column is now `kode_batch_supplier`**, and an expiring
product's opening stock no longer requires a code at all — only `tgl_expired`. A spreadsheet
cannot name a lot when the code has to be unique across the tenant.

## [Unreleased] — Kategori Supplier

Purchasing gains a screen for the labels a tenant groups its **vendors** by, at
`/dashboard/purchasing/supplier-categories`: a list with the module's usual filter panel,
a create route, an edit route, and the same retire / delete / restore lifecycle every
other label set has.

**THE FORM IS ONE INPUT, AND THAT IS THE WHOLE DESIGN.** The backend stores these beside
product categories in one collection, so the underlying schema would accept a parent, a
description and a picture. None are offered and none are sent — the API refuses them on
this resource — so the form shows a vendor group for what it is: a name, plus an Aktif
switch that appears only when editing.

**IN PURCHASING, NOT BESIDE THE PRODUCT KATEGORI SCREEN.** The two share storage; they do
not share a user. A product category is filled in while entering an item, a supplier
category while setting up a vendor. Grouping by where the rows live rather than by who
uses them would have put a purchasing setup screen inside Inventory, where nobody doing
purchasing would look for it. The nav item sits directly under Supplier — the same place
Kategori sits under Produk — and the hub gains a fifth card, which moved the card grid
from `lg:grid-cols-4` to `lg:grid-cols-3` rather than shrinking five tiles onto one line.

**A SEPARATE SERVICE, HOOK, TABLE AND FORM RATHER THAN A `kind` PROP ON THE PRODUCT ONES.**
The two screens' only common shape is "a paginated list of names"; everything a shared
component would be parameterised over — the fields, the filters, the delete copy — is
exactly the part that differs. A `kind` argument threaded through
`categoryService`/`useCategories`/`CategoryForm` would be a parameter every product screen
has to get right, and getting it wrong fails silently: a vendor group in a product picker
looks like data entry, not like a bug.

Three smaller consequences:

- **`supplierCategories` is its own entry in `PERMISSION_CATALOG`**, mirroring the backend
  catalog. A role holding `categories:*` gets no write buttons here — the screen tests pin
  that.
- **The filter panel has three fields, not four.** No `Tingkat`: this kind has no tree, and
  the API has no `parentId` to narrow on.
- **The delete confirm does not promise a guard.** A product category's dialog says the
  delete is refused while products are filed under it; nothing references a supplier
  category yet, so this one says what deleting actually does — the name is freed, the row
  is restorable — rather than describing a refusal that cannot happen. A server `409` is
  still shown verbatim if that changes.

**`CategoryKind` is now `"product" | "supplier"`**, but no form ever chooses between them:
each resource filters on its own kind server-side. `Category.kind` is narrowed to
`"product"` and `SupplierCategory.kind` to `"supplier"`, so a screen holding one cannot be
handed the other by a type that says it might.

---

## [Unreleased] — Kategori bisa punya sub-kategori

A category can now sit under another one. `Induk kategori` is a select in the form, the
parent is drawn above the row's own name in the list, and a `Tingkat` filter narrows to one
level.

**ONE CONTROL FOR A BINARY PLUS A CHOICE.** "Is this a parent or a sub-category?" and
"which parent?" are the same question asked twice — a radio pair followed by a select would
make the user answer the first, watch a second control appear, and answer it again. The
first option, *Tidak ada — kategori induk*, IS the top-level answer.

**The picker offers top-level categories only**, fetched with `parentId: "none"` rather than
filtered client-side, so its options are exactly the set the API would accept. The category
itself is excluded — nothing is its own parent. Retired parents ARE offered: `isActive`
retires a label for new products, and filing a sub-category under a paused line is how a
shop reorganises one.

**The whole field locks for two different reasons and the copy says which.** A category that
already holds sub-categories cannot become one (the tree is two deep, and the API answers
`409`), and the first category a tenant ever creates has nothing to sit under. The child
count comes from a `list({ parentId: id, limit: 1 })` on the edit page rather than a field on
every category — a per-row count on the list endpoint to answer a question only this form
asks is the more expensive side of that trade.

**The list shows a trail, not an indented tree.** A tree widget fights pagination: the
children of a row on page 2 may be on page 3, and a level that only sometimes shows its
contents is worse than a flat list that always says where each row belongs. The parent's
name sits above the row's own, and it is not a link — the row's Edit already goes to this
category, and a second destination in one cell is two targets a click has to choose between.

**`Tingkat` narrows on the SERVER**, through the one `?parentId=` parameter that carries all
four states. Filtering the fetched page instead would have left `pagination.total` counting
rows no longer on screen, and a "6 dari 20" that cannot be reconciled is worse than no count.

The duplicate-name message changed with the rule behind it: names are unique **per level**
now, so it says the name is taken *di tingkat yang sama* and that the same name is fine
under a different parent. A refused MOVE is a different 409 and renders as a banner, since
retyping the name will not fix it.

`ProductMedia`'s sibling change: `Category` gains `parentId` and a resolved
`parent: { _id, name } | null`, and `CategoryListQuery.parentId` takes `TOP_LEVEL_ONLY`
(`"none"`) or `SUB_LEVEL_ONLY` (`"sub"`) alongside a real id.

---

## [Unreleased] — Kategori gets a description, a picture, and a form of its own

`/dashboard/inventory/categories` had one editable field and a name column, which was fine
while a category was only a grouping key and stopped being fine the moment anything wanted
to *show* one. Two fields, both optional, both nullable — the fast path is still "type a
name, press Buat kategori".

**The form left the modal for two routes**, `/categories/new` and `/categories/:id`. The
dialog's own header carried the argument that now points the other way: a modal was right
while the whole form was one text input, because sending somebody to a page and back to type
one word made "add three categories in a row" three trips through the router. A picker that
uploads, an image cropper on top of it, and a 500-character description are not that form —
stacked in a modal they leave no room to see what is being typed, and the cropper would be a
dialog opening over a dialog, which Radix will do and nobody should read.

**What that costs, stated because it is real:** the list is no longer on screen while the
name is typed, and the list was the thing that told you whether the name already existed. The
409 still catches a clash and is still shown against the name field rather than as a banner —
it just arrives after a save instead of being visible before one.

`[id]` **IS the edit page, not `[id]/edit`.** A category has no detail view to occupy `[id]`:
it carries no price, no stock and no history, so a read-only page would show nothing the list
row does not. Products split the two because they genuinely have both; an `/edit` segment
here would leave `/categories/<id>` as a URL that 404s. Branches make the same call.

Both entry points are now **real links** — the toolbar's create button and every row's Edit —
so middle-click and "buka di tab baru" work, which a button wired to `router.push` never gave
them. `CategoriesScreen` holds no form state at all any more: "only one form open at a time"
used to be a single dialog slot it had to maintain, and is now structural.

**Deleting stays in the row menu** rather than gaining a danger-zone card on the edit page.
Its confirmation names how many products are in the way, which is the number that tells you
what to do next, and a second delete button would be a second copy of that reasoning to keep
in step.

**Deskripsi** is one or two sentences about what belongs under the label, and its audience is
whoever is filing a product, not a customer. It renders as **plain text everywhere**: the API
stores it as text, unlike a product description, which is sanitised HTML — so nothing here
reaches for `dangerouslySetInnerHTML`, and nothing should. It sits under the name in the
table, clamped to two lines: 500 characters is a paragraph, and a row that grows to fit one
turns the list into a page nobody can scan.

**Gambar** is one picture, and `CategoryImageField` is a new component rather than
`<MediaGallery max={1} />`. The gallery's whole subject is the array — reorder buttons, drag
handles, a "Utama" badge on index 0, a video path with a poster frame — and a category has
one slot and no order, so every one of those either disappears or becomes a control that
does nothing. `max={1}` would also still accept an MP4 the API then refuses. Two small
components beat one with a mode.

The crop is **locked square**, because every place a category is drawn is square — a
catalogue tile, a POS group button, a storefront strip. Letting the shape vary means the
tile crops on its own, without showing anyone what it removed.

**The upload happens when the file is picked, before the category is saved**, which is what
the owner-agnostic media endpoint costs: a user who then cancels leaves bytes nothing points
at, and the backend's sweeper collects them after a day. The alternative — hold the file,
upload on submit — would let the save fail on the slow half of the work after the form had
already been called valid.

**The patch sends only what moved, and the picture is the reason that matters now.** The API
deletes the bytes an update drops, so resending an unchanged asset is one dropped connection
away from losing it. `image: null` is how it is removed; removing it in the dialog only
clears the field, because deleting the bytes there would strand a live category's picture if
the user then cancelled.

In the table the thumbnail sits **inside the name cell**, not in a column of its own — a
column would be a header with no word for it and an empty rectangle on every category nobody
gave a picture to, and most will not have one. It draws the 320px derivative
(`thumbUrl ?? url`), so a page of forty categories does not fetch forty full-size images, and
a placeholder icon where there is no picture rather than an `<img>` with no `src`.

`ProductMedia` is now an alias of `MediaAsset` in `types/inventory.ts`. The type was never
product-specific — the backend moved its subdocument to a shared `models/media.schema.js` in
the same change — and renaming the ~40 existing call sites is a sweep, which adding a field
to categories is not. Prefer `MediaAsset` in new code.

---

## [Unreleased] — Batch & Expired searches by name and takes any two dates

Two gaps on `/dashboard/inventory/batches`, both of them the same shape: the screen could
only ask the question the endpoint happened to be built for.

**The search box now matches a product name and an SKU, not just a lot code.** The code is
the thing somebody has in front of them least often — a shelf label carries a name, a
barcode sticker carries an SKU, and the lot code is printed on a carton in the stockroom.
"Which lots of Royal Canin 3kg are still here" was the most common question the box could
not answer. The matching is server-side (a lot carries a `productId` and no name), so the
client change is the placeholder, the label and the empty state; the API change is in the
backend changelog.

**The expiry horizon gains "Rentang khusus"**, which opens a `FilterDateRange` under it and
sends `expiryFrom` / `expiryTo`. The 7 / 30 / 90-day presets all count forward from today,
which is the wrong shape for half of what a stock take asks — "apa yang kedaluwarsa
November", "apa yang lewat tanggal kuartal lalu". A custom window switches to the audit
endpoint exactly as a search does, because `/expiring` takes a `withinDays` and cannot
express a window that today is not an end of.

The range ships its own presets — *Sudah lewat*, *60 hari ke depan*, *Bulan ini*, *Bulan
depan*. The control's defaults all END today, which on a screen about expiry would offer
four chips that each return the same handful of already-expired rows.

Three sentences on the bar cover what the controls cannot say for themselves: why the
horizon goes quiet during a search, that an unfilled custom range is narrowing nothing, and
that a filled one excludes the lots with no expiry date at all. The dates disappear from the
panel during a search rather than sitting there greyed — the select above them already
explains the whole horizon, and two inert date inputs would be a control that accepts typing
and changes nothing.

---

## [Unreleased] — The stock card stops asking you to scroll a dropdown

Kartu Stok picked its product from a `<select>` that the screen filled by paging the **whole
catalogue** on mount — five parallel requests, a hard ceiling of 500 products, and a banner
apologising to any tenant past it. A catalogue is not a dropdown; it is a list you search. So
the choosing became a screen of its own and the card became what you open from it.

| Route | Was | Is |
|---|---|---|
| `/dashboard/inventory/stock-card` | The card, with two dropdowns | The **index**: every stock-holding product, searched and paged by the server, for one chosen warehouse |
| `/dashboard/inventory/stock-card/[productId]` | — | The **card**: product fixed by the route, warehouse still switchable |

The index searches **name and SKU** through `GET /api/products`, which already accepted both
— no backend change was needed for any of this.

**The rows are flat, and that is the difference from the catalogue.** Produk & Varian lists
one row per family and folds the variants away, because twelve documents for one product
would make a page of twenty mostly one product. A stock card is written per *variant* — a
parent holds no stock and has no ledger — so this list wants exactly the rows the catalogue
hides. `holdsStock=true` is the server's own name for that set, which also keeps parents and
bundles out without the frontend keeping its own copy of the type list.

**The warehouse sits beside the heading, and it is not a filter.** Every row arrives
carrying its quantities for every location, so the select re-reads what is already on the
page rather than re-querying — the same twenty products are listed whichever way it is set.
It opens on **semua gudang**, like the catalogue and the hub.

**A total is not a shelf, and the screen says so.** A card is always one product at one
warehouse — a running balance summed across locations would claim stock is somewhere it is
not — so a row showing a total cannot hand the card a warehouse. Rather than dropping the
option or letting the number quietly change on the way through, the row carries **"di N
gudang"** under the figure, and its link names no warehouse: the card then opens on the
location holding **the most** of that product, which is the closest single answer to the
number that was clicked. Pick one warehouse and both halves become exact again — the figure
is that shelf's, and the link carries it.

**Nothing on the index may be filtered or sorted by a quantity.** `stockByWarehouse` is
assembled per row from rows the server has already paged, so a "sembunyikan stok 0" toggle
would leave `pagination.total` describing one set while the table showed another — a page of
twenty rendering as six, and page 2 filtered from a different subset. Sorting by stock is out
for the same reason: the server cannot order by a number it was never asked to compute. What
is offered is what the API genuinely filters on — search, sort, kategori, status, terhapus.

**The `Suspense` boundary is gone**, and with it the `useSearchParams` that forced it: both
routes read their ids on the server and hand them down as props, the convention four other
pages already follow. That removes a build-time trap — a statically prerendered route calling
that hook fails `next build` while working perfectly in development. `productId` is now used
straight from the prop and never copied into state, so a second link cannot land on the
previous product's ledger.

**Three smaller things fell out of it:**

- A soft-deleted product's ledger is reachable at last. The old picker's header claimed
  deleted products were included and never sent `includeDeleted`; the index has the toggle
  that actually does it.
- The `Stok di gudang ini` tile was missing the `minStock > 0` guard the catalogue table has,
  so a product with no threshold and no stock rendered in danger red under "di bawah minimum
  (0)". Fixed while in the file.
- Without `products:read` the index now says so where the table would be and **fires no
  request** — the shape `useFinanceDashboard` already paid for once. Both routes still gate
  on `stockMovements:read`, which is the one permission the nav entry can name.

The old deep link `?productId=&warehouseId=` redirects to the card. It was documented and
bookmarkable; every link inside the app was updated, and the redirect is for the ones outside
it.

Screen details in [docs/features/stock-card.md](features/stock-card.md).

---

## [Unreleased] — Keuangan reads the real ledger

`/dashboard/keuangan` came off the fixtures. It now reads three endpoints —
`/journal-entries/summary`, `/journal-entries/balances` and the list — instead of paging the
ledger and summing it in the browser. Backend 0.39.0 shipped the two aggregates for it; the
gaps and their reasoning are in
[`PawCRM-Backend/docs/finance-dashboard-gaps.md`](../../PawCRM-Backend/docs/finance-dashboard-gaps.md).

Screen details in [docs/features/finance-dashboard.md](features/finance-dashboard.md).

### Jurnal Umum and the entry detail came off the fixtures too

`JournalEntriesScreen` reads `GET /journal-entries` behind `useJournalEntries`, and
`JournalEntryDetail` reads `GET /journal-entries/:id` behind `useJournalEntry`. With that,
`features/accounting/data/dummy.ts` had no readers left and is deleted, along with the
`DummyNotice` banner that existed to warn about it.

**Every filter is server-side now**, which is the difference from the chart of accounts next
to it. A chart is tens to low hundreds of rows and can be narrowed in the browser; a ledger
is every financial fact the tenant has ever recorded, so filtering here would mean paging the
whole book to find one entry. No sort control, because the API orders by transaction date
newest-first and names no alternative — offering an ordering the server does not have is how
a picker asks for one with no index behind it.

The inline toolbar went with it: search on the bar, and sumber, tanggal and cabang behind one
`FilterPanel` from `@/components`. A date range carries its own Terapkan, and a control
holding a draft belongs in a panel whatever else is on the row (ui-rules §8). That closes the
`JournalEntriesScreen` entry on the migration list — the `const ALL = "all"` sentinel and the
raw `ui/select` are gone, as is the last raw `<table>` in this feature.

**The totals had to be re-thought, not just re-wired.** The old screen held the whole book in
memory, so its tiles could count manual entries and add up a month. The API pages at 20, and
the same tiles over one page would have been page-scoped figures wearing whole-ledger labels:

- **Total debit** now comes from `GET /journal-entries/totals` (backend, unreleased), which
  sums Σdebit over the whole filter at every page. It renders `—` while in flight or after a
  failure rather than `0` — stating a fact about somebody's books that was never checked is
  worse than admitting it is not known. A failure does not fail the screen; the rows are the
  screen.
- **Entri** is `pagination.total`, which the server already counted.
- The **manual** and **pembalikan** counts are gone. Neither can be answered per-filter
  without an aggregate of its own, and the Sumber filter answers the first directly.
- The **month subtotals stay page-scoped**, because they honestly are, and each says so.

`/journal-entries/summary` was the tempting shortcut for the total and is the wrong endpoint:
it accepts neither `search` nor `sourceType`, so its figures would silently stop matching the
rows the moment either filter was on.

### `types/accounting.ts` corrected against the live API

`lines[].businessLine: string` never existed on the wire — the fixtures carried a name
because they were written before anything called the endpoint, and the API has always stored
an ObjectId. It is `businessLineId: string | null` now, resolved against `/business-lines`
the same way `accountId` is resolved against the COA. `branchId` joined `branchName`, and
`branchName` became nullable: only the server can answer it, and it cannot for a branch that
is gone.

### `financeSummary.ts` lost most of itself, on purpose

Revenue, expense, net profit, the per-line split and the cash position were all folds over
`JournalEntry[]`. All of them are the server's answer now. What is left is the one thing the
server has no opinion about — how a ledger entry reads as a row in a table — plus the
margins, which are display arithmetic.

The projection's properties survived the move and are still pinned by tests: only P&L
entries appear, a POS sale is one row rather than two, and a return reads as revenue going
down rather than as another sale.

### Lini bisnis is a single select

The mockup had a multi-select. The API filters one line at a time, and issuing a request per
selected line would put the arithmetic back in the browser that the endpoints exist to take
out. The unfiltered call already returns the whole split, so comparing lines needs no filter
at all.

### A failed request is never rendered as zeroes

Somebody quotes the number on this screen. A ledger failure replaces the cards with an error
and a retry; a *lookup* failure degrades instead, so a user without `businessLines:read`
gets chips reading as ids rather than no dashboard.

**`useFinanceDashboard` takes `enabled`** — found by a test. The permission check lives in
the component and a hook cannot be called conditionally, so without `journalEntries:read` it
was firing three requests guaranteed to be refused, on every page load.

### The default period comes from the server

`page.tsx` is `force-dynamic` and passes `now` down. A client component reading the clock
while rendering disagrees with the HTML the server sent, and near a month boundary the two
genuinely differ; prerendering would freeze the month at build time instead.

---

## [Unreleased] — Three MVP acceptance criteria that had been missed

A second pass over the PRD found three ACs in Inventory & Purchasing that were never
built and are **not** blocked on POS. The previous entry claimed the module would be
clean after four items; it was not — these had not been checked when that list was drawn
up. All three are on the product screens.

### Stock is grouped by branch — PCR-010

*"Detail produk: stok per warehouse **(grouped by branch di UI)**"*. The table listed
warehouses flat.

A warehouse belongs to a branch by **soft default** (PCR-019), so one set up for a bazaar
belongs to none — those collect under **"Tanpa cabang"** rather than being dropped, the
same rule the stock-on-hand report follows. The heading renders only when there is more
than one group: a single-branch tenant would otherwise get the same label above every row.

`useCatalogLookups` gained an opt-in `withBranches`, mirroring `withAccounting`, and it
**fails softly** — without `branches:read` the table renders exactly as it did before
grouping existed.

### A batch panel on the product — PCR-013

*"Detail produk: tab 'Batch' + hari ke expired"*. The backend already supported
`?productId=`; nothing had ever called it.

A **card**, not a tab: the rest of the screen is a column of cards, and a tab strip for one
extra view would hide it behind a click and make the page two shapes.

Gated on `hasExpiry` as well as `productBatches:read`. A product that does not expire still
has one internal lot per receipt — plumbing so quantities have somewhere to live — and
showing it to somebody who never asked about batches is noise.

### The barcode field warns while you type — PCR-018

*"Warning duplicate barcode saat input"*. The data was never at risk: the API enforces a
partial unique index and answers a clash with a 409. What was missing is **when** the user
finds out — after filling in a whole product and pressing save.

**Advisory, never a gate.** The save button stays enabled: the check races anything another
user does in the same second, and the server is the authority either way. Debounced at
500ms because a barcode is usually *scanned* — a burst of keystrokes — and firing per
character would be a dozen requests for one scan. A `404` is the good answer, and editing
the product that already owns the code is not a clash with itself.

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
