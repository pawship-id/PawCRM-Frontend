# Booking

`/dashboard/booking` — the day sheet, plus the two things that were missing from it: making
a booking, and moving one along. `/dashboard/booking/new` is where a booking is taken.

Backend: `/api/bookings`. Feature: `src/features/booking/`.
The POS side of the same collection is [`booking-bridge.md`](./booking-bridge.md).

---

## What it does now, and what it deliberately does not

| | |
| --- | --- |
| **Built** | The list — filtered by day, status and origin, sorted as a day sheet |
| **Built** | `BookingCreateForm` at `/dashboard/booking/new` — a **page**, not a dialog: a customer and **one or more animals**, each with its own service, groomer and duration |
| **Built** | `BookingStatusActions` — move it along the ladder, or call it off |
| **Built** | `BookingHistoryDialog` — when it reached each status, and who took it there |
| **Built** | `BookingCalendarScreen` at `/dashboard/booking/kalender` — harian dan mingguan, kolom per groomer |
| **Not built** | Capacity, and a column for a groomer who is in but has nothing booked |
| **Built** | `BookingDetailScreen` at `/dashboard/booking/:id` — one visit whole: a block per animal, its own billing state, and the pet summary |
| **Built** | `BookingForm` at `/dashboard/booking/:id/edit` — the SAME component, told a `bookingId`. Reschedule, change the services, swap the animal |

**ONE COMPONENT TAKES A BOOKING AND CORRECTS ONE**, the shape `PetForm` already
uses. Three things differ: it calls `update` rather than `create`, it never sends
`status` — a transition has rules a `$set` cannot express, so it moves through
the buttons on the booking's own page — and a row already pulled to a basket or
a bill is locked rather than hidden. Somebody correcting a visit has to SEE the
grooming that was paid for, or the total on screen stops matching the bill.

**THE FORM SAYS WHAT SAVING COSTS.** An edit re-snapshots every unbilled row at
today's catalogue price — the server's deliberate rule: changing what is being
done is a new quote. So a booking taken before a price rise and corrected after
one bills MORE, including rows nobody touched, and the warning is on the form
rather than discovered on the bill.

**NO "UBAH" ON A COMPLETED OR CANCELLED BOOKING.** Both are final on the ladder
and the server answers 409 to a PATCH on either; offering the button would send
somebody to a form that cannot save.

Editing goes through `PATCH /bookings/:id` and wants a form, not a row. The table moves a
booking along and nothing else.

---

## What PCR-040 changed underneath (FR-1)

A booking is a **visit** now: one customer, one branch, one arrival time, and one or more
animals. The animal moved off the booking onto a row of its own (`bookingitems`), and three
things on this screen changed with it.

**`petName` is now the animals' names joined** — "Mochi, Coco". It stayed a single string on
purpose: the day-sheet column wants one, and returning null for every multi-animal booking
would blank the column on exactly the bookings this change was built for. `pets[]` beside it
carries them apart, and `petCount` drives the "2 hewan" badge under the name.

**The billed badge has three states, not two.** `billingState` is `unbilled`, `partial` or
`billed`, and `partial` is the one PCR-040 created: Coco was too frightened to groom and went
home, Mochi was finished and paid for. The row reads "Sebagian sudah ditagih". A badge that
only knew billed-or-not would report the whole visit as settled.

**Read it as a badge, never as a rule.** `billingState` is a summary of the rows, kept so the
list can draw something without loading every row of every booking on the page. Whether a
particular service may be billed is a question about the ROW, and the server answers it.

**It is a page, and it used to be a dialog.** ui-rules §9 allows a raw dialog when the body
needs a form, and the dialog was the right size while a booking was six fields over a
checklist — keeping the day sheet on screen behind it is genuinely useful while agreeing a
time on the phone. Multi-pet outgrew it: three animals is three cards of five controls each,
and a dialog holding that is a form scrolling inside a scrolling page, with the save button
and the running total sliding out of reach of the fields they describe. A page has room, an
address somebody can be sent to, and a back button that means the same thing every time.

**The form was rebuilt in FR-2** (`BookingPetRowCard` + `BookingCreateDialog`): a header for
what the visit shares, a card per animal for what differs. It did NOT turn out to share a
component with the till's `AddServiceTab` — that tab feeds the cart, and the booking is raised
server-side — so the rebuild touched nothing the cashier uses.

**"Selesai sekitar" is the longest groomer's workload, never the sum.** Mochi with Sinta for
90 minutes and Coco with Rio for 60 means the customer waits 90, not 150. Cards sharing a
groomer ARE summed; one person cannot do two animals at once. This is a PREVIEW of the rule
`BookingItemRepository#summarise` applies on the server — two implementations of one rule, and
the stored answer is the server's.

---

## Why the list took over the first half of a booking's life

The table was built read-only, on the argument that every legitimate change ran through the
till. What that missed is that **the till only ever sees the END of a booking**. An animal
arriving and a groomer starting are facts nobody could record anywhere, and the person who
knows them is the receptionist watching the door — who has this screen open, not the kasir.

So the moves live here, behind the same state machine the server enforces.

---

## Making one

`BookingCreateDialog` asks the six things a booking needs, in §16's field order: **kapan**
(tanggal + jam), **dengan siapa** (pelanggan → hewan), the services, the status, and catatan
last.

| Decision | Why |
| --- | --- |
| The customer is picked through `CustomerSearchDialog` | It searches on the SERVER, so the shop with four hundred pelanggan can find the four hundredth — and it registers a new one without abandoning the half-filled booking |
| The animal follows the owner, and one pet is pre-selected | One pet is the overwhelming case; `PetQuickAddDialog` covers the rest without leaving the form |
| No price crosses the wire | The server snapshots it from the catalogue — a price a client can set is a discount a client can grant |
| The groomer select disappears when `/users` is refused | Reading staff takes `users:read`, which a receptionist has no other reason to hold. Assignment is optional and the server names an empty slot "Belum ditentukan", so a refusal costs the control, not the form |
| Wall-clock time, not UTC | `2026-09-03` + `10:30` is read in the browser's zone. "Ten o'clock" means ten o'clock where the dog is being washed |

**Only `Draft` and `Dikonfirmasi` are offered as a starting status.** The rest are things
that HAPPEN to a booking rather than ways one starts, and each has rules the status route
enforces.

**A booking with no branch is refused before the request is made** — the server books it to
the session's branch, and a user who reaches every branch signs in pointed at none of them.
The disabled Simpan says which field is still missing, that one included.

---

## Moving one

The kebab menu offers exactly the transitions `BOOKING_TRANSITIONS` allows from where the
booking stands — `statusFlow.ts` mirrors the server's map so the menu cannot offer a move
that comes back a 409.

```
draft ──► confirmed ──► check_in ──► in_progress ──► completed
  │           │             │             │
  └───────────┴─────────────┴─────────────┴───────────► cancelled
```

**Every move confirms, including the ordinary ones**, because none of them can be undone:
the ladder only runs forward, so a mis-tapped "Tandai selesai" is not a click somebody takes
back. There is no way back down the menu either — a booking checked in by mistake is
cancelled and made again.

The dialog is also where the two things worth saying fit:

- **Which rungs the jump fills in behind it.** Straight to check-in also records
  *Dikonfirmasi*, at the same minute — see below.
- **That completing here is not being paid.** The till stamps the sale when money lands;
  marking it done only says the work is finished, and a completed booking stops being offered
  to the kasir.

**Cancelling asks for a reason and does not require one.** A receptionist calling off an
appointment at the customer's request has nothing to add, and a mandatory field with nothing
to say gets filled with "-". It is gated on `bookings:cancel`, while the forward moves need
`bookings:update` — the split the permission catalogue makes.

---

## The trail

`statusHistory[]` comes back on every booking: `{ status, at, by, byName, implied }`, oldest
first. `Riwayat status` in the row menu draws it.

**Why it exists.** `status` says where a booking stands and nothing about how it got there,
and `updatedAt` answers only the last move because the next one overwrites it. *"Jam berapa
hewannya datang"*, *"sudah dikonfirmasi sebelum datang atau langsung check-in"* and *"siapa
yang membatalkan"* have nowhere else to come from.

**A skipped rung is still a rung the booking passed through.** Nobody hands over a dog for an
appointment that was never agreed, so `draft → check_in` records *both*, stamped with the
same instant. The filled-in entry carries `implied: true` and the dialog draws it as
*otomatis* — two entries at the same second would otherwise claim two separate decisions, and
this says which one somebody actually made.

**`byName` is null when nothing human moved it** — a booking settled by a paid sale — and the
dialog says "Sistem" rather than leaving a blank that reads as a field that failed to load.

**An empty trail means *not recorded*, never *never moved*.** Bookings made before the field
existed carry one, and the empty state says so rather than implying the booking sat still.

---

## Reading it

The list defaults to **everything**, not to today. The first question anybody asks this
screen is "did that grooming I just rang up actually get recorded", and an empty list
filtered to a day they have not thought about reads as "no". "Hari ini" is the date filter's
first preset.

The status filter, the badge labels and the menu all run in **ladder order** — confirmed
before check-in. A picker that lists a booking's life out of order is one people read twice.

---

## Tests

`src/tests/BookingsScreen.test.tsx`, `BookingCreateDialog.test.tsx`,
`BookingStatusActions.test.tsx`. The backend's half is `booking.service.test.js`,
`booking.api.test.js` and `booking.model.test.js`.

---

## One rule the form keeps that is easy to lose in a refactor

**Chrome must never be able to fail a save.** The success toast used to sit inside the same
`try` as the request. A test caught what that costs: the toast library threw, the catch turned
it into "Terjadi kesalahan. Coba lagi.", and a booking that had ALREADY been written was
reported as a failure — which sends somebody to make it a second time.

The order is now: write, reset, navigate, *then* announce — and the announcement has a catch
of its own. A booking that saved and could not announce itself is still a booking that saved,
and the list it lands on already shows it. `BookingCreateForm.test.tsx` pins it.

---

## Kalender — `/dashboard/booking/kalender`

**Satu blok adalah satu BARIS, bukan satu booking.** Sejak PCR-040 satu kunjungan
bisa membawa Mochi dan Coco dengan groomer berbeda, jadi satu booking muncul di
dua kolom sekaligus. Blok dari satu kunjungan membawa `bookingId` yang sama, dan
mengklik mana pun membuka kunjungan utuh — orang yang membacanya sebentar lagi
bicara dengan pemiliknya, yang datang menjemput keduanya.

**Kolomnya diturunkan dari yang dibooking, bukan dari daftar staf.** Kolom untuk
setiap pengguna adalah kolom kosong di toko dengan sepuluh staf dan dua groomer
bekerja hari itu. FR-4 butuh rosternya — groomer yang masuk tapi belum ada
pekerjaannya tetap harus punya kolom — dan itu alasan mengubahnya nanti dengan
roster di tangan.

**"Belum ditentukan" adalah kolom, paling kanan.** Membuangnya menyembunyikan
pekerjaan yang masih perlu diberi orang.

**Warna tidak pernah jadi satu-satunya pembeda**: setiap blok membawa statusnya
sebagai teks, dan legendanya selalu terlihat — kunci warna yang harus di-hover
adalah kunci yang tidak dibaca siapa pun.

**Blok tanpa durasi digambar satu slot dan berkata "durasi belum diisi".**
Mengarang panjangnya menaruh angka yang tidak dipilih siapa pun di kalender — dan
yang nanti diperlakukan sebagai fakta oleh pengecekan bentrok FR-4.

### Tanggal di layar ini adalah sumbunya, bukan field

`toISOString().slice(0, 10)` — yang ditulis di tempat lain di aplikasi ini —
salah di sini, dan sebuah uji yang menemukannya, bukan pembaca. Ia mengonversi ke
UTC lebih dulu, jadi di timur Greenwich tanggalnya **mundur**: di Jakarta
`addDays("2026-09-02", 1)` kembali sebagai `"2026-09-02"`, dan tombol
"berikutnya" tidak memindahkan apa pun.

Gunakan `localDate()` di berkas ini. Di tempat lain field tanggal adalah tanggal
pembukuan yang orang baca dan koreksi; di sini ia sumbu yang seluruh layarnya
digambar di atasnya.

---

## Cabang: asked, never inherited

The booking form and the calendar both take their branch from a picker on the
screen, not from `session.currentBranchId`.

**That session field is the TILL's idea of a branch** and it is right there: a
terminal stands in one shop all day. Everything else that writes a document in
this app asks on the form — `InvoiceCreateForm`, `ReceiptForm`, the stock forms —
and a booking taken over the phone belongs with those.

Both screens use `useBranchScope`, so **one branch fills itself in** and no
picker appears: one option is not a choice. The calendar's picker is a filter,
where empty means every branch.

The first version of both screens inherited the session branch. The cost was not
a crash — it was a booking quietly filed to whichever branch the session happened
to point at, invisible until somebody reconciled a branch's takings.
