# Profil hewan

`/dashboard/master/pets/:id` — empat tab: Info, Riwayat, Preferensi, Medis.

Backend: `/api/pets`. Feature: `src/features/pets/`.
PRD: PCR-044 / FR-5. Rencana: Fase 3.

---

## Apa yang fitur ini sebenarnya untuk

Groomer mengangkat Mochi dan tahu — tanpa bertanya siapa pun — bahwa dia alergi
sampo strawberry, tidak suka blow dry keras, dan terakhir digroom tiga minggu
lalu oleh Sinta.

Satu kalimat itu yang seluruh fitur ini layani, dan ia menentukan mana bagian
yang penting: **`PetSummaryCard`, bukan halaman profilnya.** Halaman profil
tempat fakta dimasukkan; kartu itu tempat fakta dibaca, dan hanya yang kedua
mengubah apa yang terjadi di toko.

---

## `PetSummaryCard` — komponen yang jadi fiturnya

| | |
| --- | --- |
| **Dipakai di** | Form booking (per kartu hewan), puncak halaman profil |
| **Akan dipakai di** | Panel detail kalender (Fase 4), layar check-in |
| **Tidak melakukan** | Fetch apa pun. Ia menerima `Pet` dan menggambarnya |

**Tiga tingkat, dan urutannya intinya:**

1. **Alergi berat** — merah, paling atas, selalu. Ini yang mencegah satu mandi
   berakhir buruk, dan alasan `severity` jadi field, bukan kata sifat di dalam
   kalimat.
2. **Obat rutin dan alergi ringan** — hal untuk diketahui, bukan untuk berhenti.
3. **Preferensi dan tag** — bagaimana toko menangani hewan ini.

**Ia tidak menggambar apa pun kalau tidak ada yang perlu dikatakan.** Kotak
kosong di bawah setiap hewan mengajari orang berhenti melihat kotaknya, dan hari
yang penting adalah hari kotak itu diabaikan.

**Ia muncul di atas kontrol di form booking, bukan di bawah.** Alergi berat yang
dibaca setelah layanan dipilih adalah peringatan yang datang terlambat untuk
mengubah apa pun.

---

## Kenapa sebagian terstruktur dan sebagian tidak

`pets.notes` selalu teks bebas dan tetap begitu. Temperamen adalah kalimat —
"menggigit kalau kakinya dipegang", "tuli sebelah" — dan menstrukturkannya
berarti mengarang taksonomi suasana hati hewan yang tidak akan dirawat siapa pun
di depan meja kasir.

Yang **keluar** dari teks bebas hanyalah fakta yang harus **ditindaklanjuti**:

| Fakta | Kenapa tidak bisa jadi kalimat |
| --- | --- |
| Alergi + `severity` | Hanya yang berat memicu peringatan merah. Paragraf tidak bisa ditanya mana isinya yang berbahaya |
| Obat: nama + dosis + frekuensi | Pembacanya orang yang akan menyerahkan tablet. "1 tablet" dan "2x sehari" dua pertanyaan berbeda; satu string tempat yang kedua hilang |
| Vaksinasi + jatuh tempo | Sesuatu harus bisa membandingkannya dengan hari ini |
| Dokter hewan: nama + telepon | Harus bisa ditelepon. Nama klinik tanpa nomor tidak bisa ditindaklanjuti saat dibutuhkan |

---

## Izin

`pets:medical` **adalah grant tersendiri**, bukan bagian dari `update` (kriteria
5.11). Groomer boleh menulis "mandi duluan, jangan blow keras" tanpa bisa
menghapus obat yang didiktekan dokter hewan. Menggabungkan keduanya berarti toko
memilih antara resepsionis yang tidak bisa mencatat preferensi dan yang bisa
diam-diam menghapus obat.

Preferensi tetap di bawah `update`: itu catatan tentang cara toko bekerja, dan
siapa pun yang boleh mengubah hewannya boleh menulisnya.

Perubahan **keduanya** masuk audit log **dengan nilai sebelumnya** (kriteria
5.10). "Alergi dihapus" adalah fakta yang mungkin harus dipertanggungjawabkan,
dan log yang cuma menyimpan keadaan baru tidak bisa mengatakan apa yang hilang.

---

## Riwayat

Satu daftar dari tiga sumber — booking, kasir, faktur. Yang orang ingin tahu
adalah apa yang terjadi pada anjingnya, bukan sistem mana yang mencatatnya; pill
menyaringnya, tidak memecahnya.

**Tiga query, bukan satu join.** Sumbernya tidak punya kesamaan selain `petId`:
bentuk berbeda, tanggal berbeda, kata berbeda untuk "kapan". Menggabungkannya di
basis data berarti pipeline `$unionWith` yang lebih sulit dibaca dan tidak lebih
cepat pada ukuran ini — sebuah lini masa adalah riwayat satu hewan, bukan laporan
atas seluruh tenant.

**Penitipan hotel belum ada** dan FR-5 menyebutnya. Saat modulnya ada, ia jadi
sumber **keempat di berkas yang sama**, bukan layar keempat — dan itulah alasan
pemanggil menerima daftar datar bertipe, bukan tiga ember bernama.

**Tiga angka di atasnya mengabaikan filter.** "Terakhir dilayani" punya satu
jawaban; versi yang berubah saat orang menyaring ke Kasir menjawab pertanyaan
berbeda dari yang ditanyakan labelnya. Dihitung dalam **kunjungan, bukan baris** —
mandi dan potong kuku pada satu booking itu satu kunjungan, dan menghitung baris
akan memberi tahu pemiliknya anjingnya sudah datang empat belas kali padahal
sembilan.

**Booking yang dibatalkan tetap di daftar** dan berkata begitu. "Kami booking dia
tiga kali dan dia tidak pernah datang" persis jenis hal yang riwayat dibuka untuk
menjawabnya.

---

## Tag: penyimpangan yang disengaja dari FR-5

PRD meminta **daftar tag yang dikelola tenant**, dengan editornya. Yang ada:
`GET /pets/tags` mengembalikan tag yang sudah dipakai tenant, form menawarkannya
sebagai saran, dan daftarnya merawat diri sendiri lewat pemakaian.

Alasannya: daftar terkelola dengan editor adalah layar yang harus dikunjungi
orang **sebelum** mereka bisa mendeskripsikan seekor anjing. Yang praktis dari
daftar terkelola — ejaan konsisten, sehingga filternya menemukan semuanya —
didapat tanpa layar itu.

Tag **dinormalkan di dua tempat**, server dan layar, dengan aturan yang sama:
huruf kecil, spasi jadi tanda hubung, `#` di depan dibuang. Tanpa itu `#Galak`,
`Galak` dan `galak ` adalah tiga tag, filternya menemukan sepertiga dari yang
seharusnya, dan tidak ada yang bisa menjelaskan kenapa.

---

## Yang belum ada

- **Kartu profil cetak** (kriteria 5.12). Ada di rencana, tidak di fase ini.
  Cetakan bawaan browser tidak ditawarkan sebagai penggantinya: cetakan setengah
  jadi lebih buruk daripada tombol yang jelas belum ada
- **Penitipan hotel** di lini masa — menunggu modulnya
- **Pengingat vaksinasi otomatis** lewat WhatsApp — di luar lingkup FR-5
- **Unggah berkas dari dokter hewan** — di luar lingkup FR-5
