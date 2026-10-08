# Aplikasi groomer (`/groomer`)

Web mobile untuk groomer. Rencana: `Groomer-App-Implementation-Plan.md` di root repo.

- **Rute:** `src/app/(groomer)/groomer`, frame sendiri (`GroomerShell`) tanpa sidebar. `proxy.ts` menjaga `/groomer` dengan cookie petunjuk yang sama dengan `/dashboard`.
- **Landing:** `DashboardShell` mengalihkan `/dashboard/profile` ke `/groomer` bila akun `isGroomer` dan tidak punya `bookings:read`.
- **Data:** `GET /api/groomer/jobs?date=` (`groomerService.jobs`) dan `GET /api/groomer/bookings/:id` untuk detail. Tidak ada pemilik, harga, komisi, atau data medis di respons.
- **Satuan = booking.** Satu kartu per hewan/layanan, sesinya sebagai baris (`SessionRow`). Siapa mengerjakan apa tetap per sesi: status, jam, dan tim ada di baris. Sesi yang dikerjakan dua orang menampilkan "Bersama …".
- **Layar detail** `/groomer/booking/[id]`: semua sesi, catatan, dan foto. Kartu di daftar hanya untuk aksi cepat (Hewan sudah datang, Mulai, Selesaikan, Ambil); Selesaikan tanpa foto after mengarahkan ke detail (`?foto=after&sesi=`).
- **Alur status:** Confirmed → **Hewan sudah datang** (groomer) → **Mulai** (hewan otomatis In Progress) → Selesaikan.
- **Aksi:** Mulai/Selesaikan → `bookingService.advanceSessionWork`; Ambil job → `claimSession`; catatan & foto → `setSessionRecord`. Setiap aksi memuat ulang hari itu; respons rute-rute itu hanya pengakuan untuk groomer.
- **Foto after** wajib sebelum Selesaikan (FE bertanya dulu, server menegakkan). Foto langsung terlampir saat diunggah, bukan saat Simpan.
- **Tab Open Job** hilang bila `settings.groomerApp.allowOpenJobClaim` mati. Komisi per job tidak ditampilkan (keputusan 8 Okt 2026).
- **Mulai** aktif hanya pada hari job dan bila hewan sudah In Progress (`canStart` / `startBlock` dari server).
- Aturan UI: target sentuh 44 px, teks ≥ 13 px, token warna, lencana selalu berkata.

- **Akses:** mencentang "Groomer" di form Pengguna (`isGroomer`) sudah cukup — server menambahkan izin aplikasi groomer ke akun itu, tanpa role khusus (`PawCRM-Backend/src/utils/authPermissions.js`).
- **Kartu bisa dilipat.** Default terlipat: hewan, jam, tag kondisi, dan satu baris ringkasan ("1/3 selesai", "2 berjalan", "1 belum ada groomer"). Terbuka otomatis bila ada sesi saya yang berjalan, agar stopwatch dan tombol Selesaikan tidak tersembunyi. "Hewan sudah datang" tetap tampil di kartu terlipat. Status buka/tutup hanya state kartu; tidak disimpan.
- **Pengaturan manager:** kartu "Aplikasi groomer" di Layanan › Grooming › Pengaturan (`GroomerAppSettingsCard`) — dua saklar (`allowOpenJobClaim`, `showOwnCommission`), per tenant (semua cabang), default mati. Disimpan sendiri lewat `PATCH /tenants/me { settings: { groomerApp } }` (utuh), terpisah dari draft komisi/kapasitas; perlu `tenants:update`. Server menegakkan keduanya.
- **Komisi:** kartu "Komisi bulan ini" di tab Selesai hanya bila `showOwnCommission` menyala (`/groomer/commission`). Tidak ada angka per job.
