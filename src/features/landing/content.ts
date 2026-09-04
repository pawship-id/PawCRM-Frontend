/**
 * The landing page's copy, as data.
 *
 * SEPARATE FROM THE COMPONENTS because this is the half that changes. Every
 * claim below names something the product actually does, and the rows are meant
 * to be re-read against the app when a module ships — a marketing page that
 * drifts from the product is worse than no page, because the first person to
 * catch the drift is a customer who already paid.
 *
 * Bahasa Indonesia, per ui-rules §12. The words the product does not use ("POS",
 * "invoice", "platform", "UMKM") do not appear here either.
 */

/**
 * The two conversations the page can start, as prefilled WhatsApp messages.
 *
 * WHY A MESSAGE AND NOT A FORM. There is no lead endpoint behind this app —
 * `POST /api/tenants` is platform-owner administration and is not gated yet, and
 * nothing stores an enquiry. A form would need a place to put what it collects
 * before it collects anything, and until that exists it would drop what somebody
 * typed. So the form's questions are asked HERE, in the channel that already
 * answers them, and the reply comes from a person — which is what the page
 * claims a few sections above it.
 *
 * THE BLANK LINES ARE THE FORM. Somebody opens WhatsApp and finds three labels
 * waiting for three answers, which is faster than being asked them one at a time
 * and is the whole reason to prefill rather than open an empty chat.
 *
 * REPLACE THIS WITH A REAL FORM once an enquiry has somewhere to live. The
 * questions do not change; only where the answers land does.
 */
export const WHATSAPP_INTENTS = {
  /** Wants the trial. Asks for exactly what setting up a tenant needs. */
  trial: `Halo Buloo, saya mau minta akses uji coba 14 hari.

Nama toko:
Nama saya:
Jumlah cabang:`,
  /** Not ready to ask for anything yet, and should not be made to pretend. */
  talk: "Halo Buloo, saya mau tanya-tanya dulu soal Buloo untuk petshop saya.",
} as const;

export type WhatsappIntent = keyof typeof WHATSAPP_INTENTS;

/** In-page anchors, in the order the sections appear. */
export const LANDING_SECTIONS = [
  { id: "masalah", label: "Yang dibereskan" },
  { id: "kenapa", label: "Kenapa Buloo" },
  { id: "analitik", label: "Analitik" },
  { id: "cakupan", label: "Cakupan" },
  { id: "perubahan", label: "Yang baru" },
] as const;

/**
 * The example basket in the hero.
 *
 * MARKED AS AN EXAMPLE by the panel's own caption, never passed off as a real
 * shop's figures. The stock badge on the third line is the one the till really
 * draws: a product at or under its own `minStock` — and `minStock: 0` means
 * "do not alert", which is why the other two lines carry no badge.
 */
export interface MockLine {
  initial: string;
  name: string;
  detail: string;
  /** The orange stock badge, when the line has one. Carries a word, per §1.3. */
  badge?: string;
  amount: string;
}

export const MOCK_LINES: MockLine[] = [
  {
    initial: "M",
    name: "Grooming Paket Basic",
    detail: "Mochi · groomer Sinta · ditarik dari booking",
    amount: "Rp 120.000",
  },
  {
    initial: "R",
    name: "Royal Canin Adult 2 kg",
    detail: "1 pcs · stok 12",
    amount: "Rp 285.000",
  },
  {
    initial: "G",
    name: "Goat Milk Bubuk 200 g",
    detail: "2 pcs",
    badge: "Stok tipis · 4",
    amount: "Rp 86.000",
  },
];

/** The five complaints, and where each one lands in the product. */
export interface Problem {
  quote: string;
  answer: string;
}

export const PROBLEMS: Problem[] = [
  {
    quote: "Stok di catatan 8, di rak tinggal 3.",
    answer:
      "Stok berkurang saat pembayaran ditutup, bukan dari input terpisah. Tiap varian punya angkanya sendiri, dan barang yang menyentuh ambang minimumnya sendiri dapat badge oranye di layar kasir — ambang 0 berarti “jangan peringatkan”, bukan “peringatkan terus”. Kalau angkanya sudah terlanjur minus, ada halaman Stok Minus yang menyebut produk dan gudangnya.",
  },
  {
    quote: "Pelanggan balik ambil dompet, antrean di belakang macet.",
    answer:
      "Keranjangnya Simpan, kasir lanjut ke orang berikutnya, lalu dibuka lagi utuh dari Keranjang Tersimpan — masih milik shift yang sama. Tidak ada yang dibatalkan lalu diketik ulang.",
  },
  {
    quote: "Grooming Mochi sudah dibooking, di kasir diketik manual lagi.",
    answer:
      "Pilih pelanggannya, booking hari itu muncul sendiri, tinggal ditarik ke keranjang lengkap dengan nama hewan, layanan, dan groomer-nya. Satu kunjungan bawa tiga ekor tetap kepisah per hewan, dan baris yang sudah ditagih tidak bisa tertarik untuk kedua kalinya.",
  },
  {
    quote: "Siapa yang bisa ambil anjing jam dua?",
    answer:
      "Kalender harian menggambar satu kolom per groomer — termasuk yang belum punya pekerjaan sama sekali, ditandai “kosong”, karena justru dia jawabannya. Judul kolomnya menyebut beban yang sudah terisi, bukan kapasitas: sistem tidak tahu jam kerja siapa pun, dan pagar yang salah lebih mahal daripada tidak ada pagar. Groomer yang libur tidak dapat kolom, dan di form booking barisnya tidak bisa diklik dengan alasannya tertulis.",
  },
  {
    quote: "Cabang Barat rugi, ketahuannya pas tutup buku.",
    answer:
      "Cabang dan gudang dua hal berbeda dan dipisah tegas: shift kasir mengikat keduanya, jadi omzet tidak pernah masuk ke cabang A sementara stoknya dipotong dari gudang cabang B. Laba Rugi bisa dibaca per cabang dan per lini bisnis kapan saja, dan apa yang boleh dilihat seseorang ditentukan hak aksesnya.",
  },
];

/** Three principles, each with something in the shipped product to point at. */
export interface Principle {
  title: string;
  body: string;
  proof: string;
}

export const PRINCIPLES: Principle[] = [
  {
    title: "Satu angka cuma dihitung di satu tempat",
    body: "Tidak ada satu layar pun yang mengalikan qty dengan harga sendiri. Keranjang dikirim utuh, servernya yang menghitung, layarnya menggambar hasilnya. Uang menyeberang sebagai teks, bukan angka desimal.",
    proof:
      "form Retur tidak menampilkan angka refund sama sekali. Menghitungnya dua kali berarti dua jawaban, dan yang salah akan sampai ke pelanggan lebih dulu daripada ke kami.",
  },
  {
    title: "Yang tidak bisa dibenarkan, tidak boleh diketik",
    body: "Penerimaan barang tidak punya tombol ubah dan tidak punya tombol hapus. Di situ HPP lahir, dan tiap penjualan berikutnya dihitung dari angka itu.",
    proof:
      "koreksinya lewat retur ke supplier, yang membalik di harga pengiriman itu sendiri dan mengatakannya di jurnal — bukan lewat edit yang menghapus jejaknya.",
  },
  {
    title: "Bahasa toko, bukan bahasa sistem",
    body: "Layarnya bernama Kasir. Alamat struk pelanggan berbunyi /struk, dan sengaja tidak diindeks mesin pencari — satu-satunya halaman di aplikasi ini yang dibaca orang luar.",
    proof:
      "kotak harga menolak tanda titik. “150.000” terbaca seratus lima puluh ribu oleh orang, dan Rp 150 oleh komputer. Yang aman adalah menolak karakternya, bukan menebak maksudnya.",
  },
];

/** What the Keuangan half of the page argues, beside the example panel. */
export const ACCOUNTING_POINTS = [
  {
    title: "Jurnalnya ditulis saat transaksinya terjadi",
    body: "Penjualan, penerimaan barang, opname, pembayaran piutang — semuanya memposting sendiri, di transaksi yang sama.",
  },
  {
    title: "“Ke akun mana?” dijawab tiga tingkat",
    body: "Akun milik itemnya, lalu default kategorinya, lalu akun bawaan tenant. Kategori yang belum diisi tidak membuat penyimpanan gagal — ada jaring di bawahnya.",
  },
  {
    title: "Satu faktur, beberapa kategori, jurnalnya pecah sendiri",
    body: "Treats masuk akun Treats, retail masuk akun retail. Tidak dirapikan manual di akhir bulan.",
  },
  {
    title: "Sumbu yang sama dipakai di semua laporan",
    body: "Cabang dan lini bisnis, dari ringkasan sampai Laba Rugi dan Arus Kas, jadi angka di dua layar tidak pernah berbeda.",
  },
  {
    title: "Ringkasannya dihitung di server",
    body: "Toko yang memposting per transaksi menghasilkan tiga sampai enam ribu jurnal sebulan. Menjumlahkannya di browser adalah cara paling pelan untuk salah.",
  },
];

/**
 * The example Keuangan figures.
 *
 * THE THREE HEADLINE LABELS AND THEIR HINTS ARE THE SCREEN'S OWN — the same
 * words `FinanceDashboardScreen` renders, so somebody who signs up recognises
 * what they were shown. The margin word comes from the same band table: 31,5 %
 * is "Sehat".
 */
export const FINANCE_FILTERS = [
  "Periode · Bulan ini",
  "Cabang · Semua",
  "Lini bisnis · Semua",
];

export const FINANCE_FIGURES = [
  {
    label: "Total Revenue",
    value: "135,4 jt",
    hint: "Belum termasuk PPN keluaran",
  },
  {
    label: "Net Profit",
    value: "42,6 jt",
    hint: "Margin 31,5% · Sehat",
    good: true,
  },
  {
    label: "Saldo Kas & Bank",
    value: "61,2 jt",
    hint: "Posisi kas & bank saat ini",
  },
];

/**
 * The bars.
 *
 * `share` is the width as a percentage OF THE LARGEST ROW, not of the total —
 * so the longest bar fills its track and the rest read against it. Both groups
 * add up to the Total Revenue above them; a panel whose halves disagreed would
 * be the exact failure the page is claiming the product does not have.
 */
export interface Bar {
  label: string;
  share: number;
  value: string;
  /** The one orange bar per group — never more, per ui-rules §4. */
  accent?: boolean;
}

export const SALES_BY_BRANCH: Bar[] = [
  { label: "Pusat", share: 100, value: "Rp 78,4 jt" },
  { label: "Barat", share: 47, value: "Rp 36,9 jt" },
  { label: "Selatan", share: 26, value: "Rp 20,1 jt", accent: true },
];

export const SALES_BY_LINE: Bar[] = [
  { label: "Retail", share: 100, value: "Rp 81,2 jt" },
  { label: "Grooming", share: 50, value: "Rp 41,0 jt" },
  { label: "Penitipan", share: 16, value: "Rp 13,2 jt" },
];

/** What is built, one line each. */
export const SCOPE = [
  {
    title: "Kasir",
    body: "Shift dengan saldo awal, keranjang tersimpan, void & retur, X-Report dan Z-Report.",
  },
  {
    title: "Struk",
    body: "58 mm, 80 mm, dan A4 dari satu stylesheet, plus link struk untuk pelanggan.",
  },
  {
    title: "Booking grooming",
    body: "Kalender per groomer, satu kunjungan banyak hewan, jadwal libur dan peringatan bentrok.",
  },
  {
    title: "Hewan",
    body: "Alergi bertingkat, obat rutin, preferensi, riwayat — terbaca ulang di form booking.",
  },
  {
    title: "Layanan",
    body: "Harga rata, atau per tipe hewan × ukuran × jenis bulu. Barisnya dibuatkan sistem.",
  },
  {
    title: "Produk & varian",
    body: "Matriks varian dengan pengisian massal harga jual dan stok minimum.",
  },
  {
    title: "Stok",
    body: "Kartu stok, opname, batch & expired, transfer antar gudang, dan halaman stok minus.",
  },
  {
    title: "Pembelian",
    body: "Penerimaan barang, faktur pembelian, retur ke supplier. HPP rata-rata bergerak di sini.",
  },
  {
    title: "Faktur, piutang & komisi",
    body: "Faktur dari kasir atau manual, pembayaran yang bisa dibatalkan, rekap komisi groomer.",
  },
  {
    title: "Keuangan, cabang & akses",
    body: "Laba rugi per cabang dan lini bisnis, hak akses per fitur, audit log.",
  },
];

/**
 * The last four releases.
 *
 * DATES ARE THE MONTH THE WORK LANDED, read off the changelog and the commit
 * history — not rounded up to make the page look busier.
 */
export const RELEASES = [
  {
    month: "2026-09",
    when: "September 2026",
    title: "Kalender booking, jadwal libur, dan peringatan bentrok",
    body: "Kolom per groomer, harian dan mingguan. Yang libur tetap terlihat di daftar tapi tidak bisa dipilih, dengan alasannya tertulis. Menambahkan hari libur juga menunjukkan booking yang akan terdampak sebelum disimpan.",
  },
  {
    month: "2026-08",
    when: "Akhir Agustus 2026",
    title: "Kasir jalan, dan tiap penjualannya punya faktur",
    body: "Shift, keranjang tersimpan, pembayaran gabungan, X/Z-Report. Dulu hanya penjualan piutang yang menerbitkan faktur; sekarang penjualan tunai pun, lengkap dengan rincian barang dan cara kasir menyelesaikannya.",
  },
  {
    month: "2026-08",
    when: "Pertengahan Agustus 2026",
    title: "Akun jurnal ikut kategori produk",
    body: "Satu faktur berisi barang beda kategori otomatis pecah jurnalnya. Kategori yang belum diisi jatuh ke akun bawaan tenant, bukan gagal simpan.",
  },
  {
    month: "2026-07",
    when: "Juli 2026",
    title: "Penerimaan barang jadi tempat HPP lahir",
    body: "Rata-rata tertimbang hanya bergerak di satu layar; semua layar lain membacanya. Penerimaan tidak bisa diubah — koreksinya retur, yang membalik di harga pengiriman itu.",
  },
];

/** What a shop gets while it is moving in. Each line is a screen that exists. */
export const ONBOARDING = [
  {
    lead: "Katalog lama masuk lewat Import Produk.",
    body: "Unduh template, isi, lihat pratinjaunya — baru disimpan.",
  },
  {
    lead: "Stok awal punya layarnya sendiri.",
    body: "Jumlah dan harga beli per unit dicatat apa adanya, bukan lewat penjualan atau pembelian palsu.",
  },
  {
    lead: "Semua yang mengubah angka tercatat.",
    body: "Audit Log menyimpan siapa mengubah apa, dan kapan.",
  },
  {
    lead: "Angkanya bisa dibawa keluar.",
    body: "Kartu stok dan rekap komisi bisa diunduh sebagai spreadsheet.",
  },
  {
    lead: "Tiap fase ditutup panduan uji coba.",
    body: "Ditulis untuk pemilik toko, bukan untuk programmer.",
  },
];
