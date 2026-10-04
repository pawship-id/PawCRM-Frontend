# Booking

`/dashboard/booking` — the day sheet, plus the two things that were missing from it: making
bookings, and moving one along. `/dashboard/booking/new` is where bookings are taken;
`/dashboard/booking/:id` is one booking, whole.

Backend: `/api/bookings`. Feature: `src/features/booking/`.
The POS side of the same collection is [`booking-bridge.md`](./booking-bridge.md).
The contract this screen follows is `Booking-Satu-Hewan-Implementation-Plan.md` at the root of
the workspace.

---

## One booking is one animal and one main service

Decided 14 September 2026. **A booking (one number) is one animal plus one main service**, with
add-ons under that service. An owner bringing two dogs gets two bookings; the same dog having a
bath and a hotel stay is two bookings as well.

**Bookings saved together share a `groupId`.** One save of the form is one group, and a booking
made on its own is a group of one. `GET /bookings/:id` lists the other live bookings of the group
in `group[]`, and the list screen filters on it. Nothing is billed from the group yet — it is
where a per-visit transport fee will be counted later.

What this removed from the screens, all of it on purpose:

| Gone | Why nothing replaces it |
| --- | --- |
| `pets[]`, `items[]`, `petItemId`, `petCount` | The booking IS the animal: `petId`, `petName`, `status`, the notes, the album and the claim sit on the booking itself |
| `billingState: "partial"` | One booking is one service — on a basket or a bill, or not. `unbilled` / `billed` |
| `bookingItemId` on cart and invoice lines | `bookingId` already points at exactly one animal and one service |
| `/dashboard/booking/:id/hewan/:petId` | The booking's own page is that work now; the old address **redirects** there |
| "N hewan" on the list and the board | One row per booking |

The status names stay English (ui-rules §12), and so does the status control. Everything else is
Bahasa.

---

## What it does now, and what it deliberately does not

| | |
| --- | --- |
| **Built** | The list — one row per booking, filtered by day, status, origin and groomer, sorted as a day sheet; `?groupId=` narrows it to one group, shown as a removable **Satu kunjungan** chip |
| **Built** | `BookingForm` at `/dashboard/booking/new` — a **page**: a shared header and **one card per booking** |
| **Built** | `BookingForm` at `/dashboard/booking/:id/edit` — the SAME component, told a `bookingId`, with exactly one card |
| **Built** | `BookingDetailScreen` at `/dashboard/booking/:id` — the booking whole: status, schedule, trip, total, the animal, what was handed over, the turns, the album, the notes, the other bookings of the visit, the trail |
| **Built** | `BookingStatusActions` — move it along the ladder, reschedule it, or call it off |
| **Built** | `BookingCalendarScreen` at `/dashboard/booking/kalender` — harian dan mingguan, kolom per groomer |
| **Built** | A column for a groomer who is **in but has nothing booked**, on the daily view — labelled `· kosong` |
| **Built** | Each column's **load** — `· 4j 30m terisi`, or `· kosong` |
| **Not built** | Capacity as a ceiling — see below |
| **Not built** | Moving or rescheduling a whole group at once — each booking is moved on its own page |
| **Not built** | Transport fees — `pickupRequested` / `deliveryRequested` / `tripAddress` are recorded, not billed |

**THE EMPTY COLUMN, AND WHY IT TOOK THE ROSTER TO BUILD.** A calendar showing only busy people
cannot answer the question a receptionist brings to it — "siapa yang bisa ambil anjing jam dua" —
because the one person who can is exactly the one with no blocks.

**Only on a single day.** "Who is in" is a per-day fact; a week has no single answer, and the
weekly view asks "which day is full" anyway.

**Who counts as a groomer is `users.isGroomer`.** It was derived from work already assigned for
one release, and the derivation was **removed** rather than kept as a fallback: two sources for
one question is how they come to disagree.

**Somebody off today gets no column.** A column is somewhere to drop work, and dropping work on
somebody on leave is what FR-4 refuses outright.

**LOAD, NOT CAPACITY, AND THE DIFFERENCE IS THE POINT.** "Capacity" would mean announcing a
limit, and nothing in this system knows anybody's working hours. So the header reports what IS
booked and lets the shop judge. A wrong ceiling would be worse than no ceiling, because somebody
would start refusing work against it.

**A block with no duration counts as one slot** — the same assumption the grid draws it with.
Counting it as zero would make a day of untimed work look empty, which is the one reading that
gets somebody double-booked.

---

## Why the list gave the moves back to the booking's page

The table was built read-only, on the argument that every legitimate change ran through the till.
What that missed is that **the till only ever sees the END of a booking** — an animal arriving and
a groomer starting are facts the receptionist watching the door knows. So the moves went onto the
row, and **came off it again on 5 September 2026**.

**The ladder outgrew the row.** Nine rungs, two conditional on the booking, and guards that refuse
`completed` until every session is finished: the row menu was answering questions whose evidence
is on the detail page and nowhere near the row. Moving a booking from a list is a decision taken
without looking at the thing being decided about — and *"Mark completed"* on the wrong row fires
commission for the wrong visit, with no undo.

The row's number opens the booking, where the moves are, next to what they are about. The
Grooming board is the deliberate exception: its rows keep an in-row status select and
Mulai/Selesai, because that board is a working surface at the table.

---

## Making bookings

`BookingForm` asks in §16's field order: **kapan** (tanggal + jam) → **di mana** (cabang, lokasi
layanan) → antar-jemput → **dengan siapa** (pelanggan) → **the booking cards** → catatan last.
**There is no status field** — see below.

### The page is four cards and one list

`Jadwal & lokasi` · `Antar-jemput` (only for a salon visit) · `Pelanggan` · **the bookings** ·
`Catatan`. The header cards are what every booking of the save shares; on a create they are
written onto each booking, and after that each booking can be changed on its own.

**The bookings are the one group NOT wrapped in a card**, and that is deliberate: each booking's
card is the white card there. White cards inside another white card leave the middle level doing
nothing — a border around a border — and the hierarchy that reads is:

```
page tint
└── white card per booking        ← bg-surface, tinted header strip
    └── tinted inset: the service ← bg-background, the page's own colour
```

### One card is one booking

`BookingCard` holds exactly what one booking has, top to bottom:

```
[1] Mochi                                   [×]
    Grooming Full Service
  [ Hewan ▾ ]            [ Groomer ▾ ]
  (pet summary: allergies, handling notes)
  │ Layanan utama *
  │   [ Tipe layanan ▾ ]   [ Layanan ▾ ]      ← the second is narrowed by the first
  │   Rp 180.000 · varian Besar
  │   Add-on
  │     ☐ Parfum   Rp 20.000 · +10 mnt        ← only what THIS service offers
  │   Durasi 90 mnt · ubah
  ▸ Catatan & barang bawaan (2)
```

**Exactly one main service per card.** There is no "Tambah layanan": a second service is a
second booking, so it is a second card — **Tambah booking** under the list, up to ten
(`MAX_CARDS`, mirroring `MAX_BOOKINGS_PER_GROUP`).

**The same animal may be on two cards.** Mochi's bath and Mochi's hotel stay are two cards naming
Mochi. What is refused is the same animal with the **same** main service on two cards — one
grooming booked twice — and the message lands on the later card, naming the animal
(`duplicateCardKeys`, PRD 2.7).

**The card is titled by its animal, and that is the whole layout.** The first version was flat,
and the question it produced was *"ini input buat hewan 1 atau hewan 2?"*. A tinted header strip
with a numbered badge and the animal's name as an `<h3>` answers it; an empty card still says
`Booking ke-2`, and the chosen service is named under the title.

**The type filter clears the chosen service** when it changes: leaving a name the list below no
longer offers is worse than asking again.

**The form's shape and the API's meet in `bookingDraft.ts`, and nowhere else.** `cardsToEntries`
builds `bookings[]` for a create (cards without an animal or a service are dropped, not sent
empty); `cardFromBooking` loads one booking into a card and `cardToUpdate` sends it back as flat
fields. It is tested directly because the property that matters — **load a booking, change
nothing, save it back unchanged** — is invisible to a rendering test: it would pass while quietly
dropping every add-on, and the loss would show up on the bill.

### The status is the button, and there is no field for it

| Button | Saves as | Blocked while required fields are empty |
| --- | --- | --- |
| **Simpan booking** (primary) | `requested` | Yes — with `blockedReason` saying which field |
| **Simpan sebagai draf** (secondary) | `draft`, always | **No** |

**A select asked the wrong question.** What somebody writing down a phone call is deciding is
**whether they are finished**, not which rung a booking should start on. It was also a second
door into the state machine, able to put a booking into `confirmed` with nobody at the shop
agreeing to it.

**The draft button is not blocked by `blockedReason`, and Simpan is.** A draft is exactly what you
save when the required fields are NOT answered. It is off only while nothing could be sent at all
(no customer picked).

**Neither is offered as a status change when editing.** `PATCH` carries no status; the edit form
has **Simpan booking** only.

### Where a save lands

`POST /bookings` answers with the group: `{ groupId, bookings }`.

| Bookings made | Goes to | Toast |
| --- | --- | --- |
| One | `/dashboard/booking/:id` — its own page is the next thing anybody does with it | `Booking BK-… dibuat.` or `Booking dibuat sebagai draf.` |
| Several | `/dashboard/booking?groupId=…` — the list narrowed to the group, with a removable chip | `N booking dibuat.` |

An edit goes back to the booking it corrected.

### Three things are folded away

A booking is usually one animal, one service, the catalogue's duration, no note and nothing handed
over — so the three controls usually left alone are behind a fold, and each fold says when it
holds something:

- **Durasi** is a button showing the catalogue's number (`Durasi 90 mnt · ubah`).
- **Catatan & barang bawaan** is one disclosure per card, with a count when it holds anything —
  **each note counts as one** — and it **opens by itself** when the booking already has something
  in it.

### The groomer is asked once per card, and settled per session

**On the form: one default per booking.** At booking a shop says "Sinta is doing Bruno today". The
answer is written onto the booking's sessions.

**On the booking's own page: per session, and more than one.** `SessionCrew` hands a turn to
somebody else or adds a second pair of hands; `AddSessionButton` adds a turn by name. Two people
on one bath are two turns, and both earn — commission is per session (`commissionrecords` is
unique per `{ sessionId, groomerUserId }`).

### The price follows the animal

A service priced per variant is quoted from the pet's own **species, size and coat** — the card
shows the number and which variant it came from, and the bar's total agrees with it.

**When the animal's record is missing the fact the price varies by, the card says which fact,
Simpan is disabled naming the animal, and the message links to that pet's edit page** in a new
tab: this form holds unsaved state. **Coming back is enough** — the animals are re-read quietly on
`visibilitychange`, without blanking the cards somebody is in the middle of.

**No size, no booking** (13 September 2026): commission is read against it, so the server refuses
any booking for an animal without one, and the card says so on the animal.

**A switched-off variant** is refused for a NEW pair and allowed for a pair already on the stored
booking (`storedPetServiceKeys`), so correcting the time of an old booking is not refused over a
service nobody touched.

### Add-ons

Ticked underneath the service, from **that service's own list** — the server refuses anything
outside it. Never in the main service dropdown: an add-on booked on its own is refused too. Sent as
`addonServiceIds` on the entry. The finish-time preview counts an add-on's minutes against the
card's groomer.

**"Selesai sekitar" is the longest groomer's workload, never the sum.** Mochi with Sinta for 90
minutes and Coco with Rio for 60 means the customer waits 90, not 150. Cards sharing a groomer ARE
summed; one person cannot do two animals at once.

### Lokasi, antar-jemput, barang bawaan

| Field | Shape | Note |
| --- | --- | --- |
| Lokasi layanan | `in_store` / `in_home` | Narrows the catalogue: a service that cannot be done at home is refused for a house call |
| Antar-jemput | Two check-rows + an optional address | Asked once in the header and written onto **every booking of the save**; editable per booking after. The question **disappears** on a house call; the server forces both off |
| Barang bawaan | Add-and-remove chips, per card | What the owner says they will bring. Nothing here ticks anything in — the counter confirms arrival on the booking's page. On an edit the list goes back with each item's `_id`, so a stored check-in survives |

### Two notes per booking, and one for the visit

| Field | Label | Who reads it |
| --- | --- | --- |
| `internalNotes` | **Catatan internal** | Staff only — "takut hairdryer, mandi duluan" |
| `customerNotes` | **Catatan untuk pelanggan** | The owner — "bulunya kusut parah, disarankan grooming tiap 3 minggu" |
| `notes` | **Catatan** (the header) | About the appointment, not the animal |

**The labels are the feature, not the storage.** The person typing decides where a sentence lands,
so the label has to answer *who reads this* before the cursor gets there. The customer box's hint
says out loud that **nothing prints it on a struk or sends it over WhatsApp yet**.

### Editing one — `/dashboard/booking/:id/edit`

**Exactly one card, no Tambah booking, no remove.** It corrects one booking; a second animal for
the same visit is a new booking. It sends `PATCH /bookings/:id` with flat fields — `petId`,
`serviceId`, `addonServiceIds`, `durationMin`, `groomerUserId`, the two notes, `belongings` — plus
the header's.

**The form says what saving costs.** An edit re-snapshots an unbilled service at today's catalogue
price, so the warning is on the form rather than discovered on the bill.

**A billed booking is locked, not hidden.** Its animal and service cannot change, the card says
*Sudah ditagih*, and the customer cannot be swapped. **Changing the customer** of an unbilled
booking takes it out of its group, and the form says so.

| Decision | Why |
| --- | --- |
| The customer is picked through `CustomerSearchDialog` | It searches on the SERVER, and registers a new one without abandoning the half-filled form |
| The animal follows the owner, and one pet is pre-selected | One pet is the overwhelming case; `PetQuickAddDialog` covers the rest |
| No price crosses the wire | The server snapshots it from the catalogue — a price a client can set is a discount a client can grant |
| The groomer select disappears when availability is refused | Assignment is optional and the server names an empty slot "Belum ditentukan", so a refusal costs the control, not the form |
| Wall-clock time, not UTC | "Ten o'clock" means ten o'clock where the dog is being washed |
| A booking with no branch is refused before the request is made | The disabled Simpan says which field is still missing |

---

## The booking's page — `/dashboard/booking/:id`

`BookingDetailScreen`. It used to be two pages — an overview of a visit that could hold several
animals, and `BookingPetWorkScreen` per animal under `/hewan/:petId`. A booking is one animal now,
so the overview and the work sheet describe the same thing, and they are one page. The old address
is a server `redirect()` to this one.

### The head

**One heading block, and the booking NUMBER is the title** — `Booking (draf)` while it has none.
The page renders the breadcrumb and nothing else; this screen owns the only `<h1>`. Beside it: the
**status badge** and the **billing word** (*Belum ditagih* · *Ada di keranjang* · *Sudah dibayar* ·
*Sudah ditagih*). Under it: the animal · the service, the customer and their phone, and the audit
line *"Dibuat … · Fitria (staff)"*.

Actions on the right: **Ubah** (not once the work is completed or the booking cancelled — the
server answers 409), **Cetak** (the printable pet card), **WhatsApp** (only when the phone
normalises into a real `wa.me` number).

Below a rule: **Status sejak** with the last move and who made it, a track with **one segment per
rung** this booking walks (draft dropped; the trip legs only when a van was booked; navy, not
orange), *Layanan belum selesai* when a turn is still open, the count of finished turns, and
`BookingStatusActions variant="prominent"` — the next rung as a primary button, the rest behind
**Other statuses**.

### Kunjungan

Tanggal · Waktu (start – estimated finish) · Cabang · Lokasi · Antar-jemput (spelled out — *Tidak
ada* is an answer) · Durasi aktual / est; the trip address when there is a trip; then the service
with its snapshot kind, the facts its price was quoted from, the add-ons under it and the **Total**
(`totalAmount`, or the service plus add-ons when no summary has run); then the visit note.
**Edit layanan & harga** sits on this card for whoever may reprice.

### Hewan & Pelanggan

The animal at arm's length — icon, name, breed · weight · species, size and coat as chips, **Profil
<nama>** — then `PetSummaryCard` (allergies, handling notes, FR-5 kriteria 5.14), then the customer
and WhatsApp number. The profile is allowed to fail; the work still renders.

### Titipan Owner

`BookingBelongingsCard`, above the turns — what the owner handed over is checked at the two moments
that bracket the work. Two ticks per item, **Masuk** and **Keluar**:

| Rule | Where it lives |
| --- | --- |
| Keluar is not tickable before Masuk | The box is disabled; the server also refuses it with a `409` naming the item |
| Unticking Masuk clears Keluar | Server |
| A booking cannot be completed while something is still here | Server, and the card shows the same sentence |
| Something that never arrived is **not** outstanding | Both — it is why the stored shape carries two dates |

**One request per tick** against that item's id, and **Tambah barang** is `POST
/bookings/:id/belongings` (no `petId` — the booking is the animal), defaulting to checked in. The
row reflects the server, not the click.

### Sesi pengerjaan

One row per **turn** of the service. Folded by default; the one being worked on opens itself. A
closed row already answers who, where it stands, and how many minutes.

Inside: the leave warning (*"… ganti groomer atau hubungi pelanggan"*), `SessionCrew`, the stamps
(Mulai · Selesai · Aktual — **read, not typed**), `SessionRecord` (notes and photos for that turn),
then **Mulai** / **Selesai** (`PATCH /bookings/:id/sessions/:sessionId/work`) and **Hapus sesi**
last, behind a confirm.

| Rule | Why |
| --- | --- |
| Mulai is disabled until the booking is `in_progress`, with the reason under it | The server refuses it; a button that vanishes teaches nothing |
| A turn with nobody on it has no Mulai | "Who did this" is what duration and pay are read against |
| **No "Buka lagi"** | Work marked done is done from this screen; the API still allows the correction |
| **Tambah sesi** is hidden at or past `completed` | A new turn would reopen finished, commissioned work (409) |
| A finished turn's crew is read-only | Who stood at the table for finished work is a record, not a setting |

### Album

`SessionAlbum` reads and writes `booking.media` (`PATCH /bookings/:id/media`) — Before, After,
Lainnya — a different array from a turn's own photos. The file is uploaded to storage first and the
album row written second; `Simpan` commits the kind, the file and the note together.

### The rail

**Catatan booking** (`BookingNotesCard`) — both notes, editable in place, **saved on blur one field
at a time** through `PATCH /bookings/:id/notes`, never the wholesale edit (which would reprice).
Read-only text without `bookings:update`.

**Satu kunjungan** — the other live bookings of the group (`booking.group`), each a link to its own
page with its animal, service, number, time and status badge. Hidden when the booking was made on
its own. It is a list of links, not a summary: each sibling has its own status and bill.

**Riwayat** (`BookingHistoryCard`) — the trail, newest first; see below.

A pointer to **Laporan › Komisi** — commission figures are payroll, and payroll has its own grant.

---

## Moving one

**On the booking's own page, not on the list.** The menu offers exactly the transitions the server
allows from where the booking stands — `statusFlow.ts` mirrors `booking.model.js`, and every
function there takes **the booking** (the rung and the trip that decides which rungs exist):

```
draft ─► requested ─► confirmed ─► [pickup] ─► arrived ─► in_progress ─► completed ─► [delivery] ─► return_to_pawrents
  │          │            │           │           │            │
  └──────────┴────────────┴───────────┴───────────┴────────────┴──► cancelled
```

`PATCH /bookings/:id/status` takes `{ status, reason? }` — no `petId`.

**The status names are shown in ENGLISH**, and the status CONTROL followed ("Confirm booking",
"Mark arrived", "Start work", "Other statuses", "Reschedule"). It stops at the control: the dialogs
behind those rows, the cancel reason and every toast stay Bahasa. See ui-rules §12.

**`requested` is where a saved form lands, and `confirmed` is a separate act.** A booking that
confirmed itself was one nobody had checked.

**`completed` is not the end**, and the split it created is the thing to remember. Money closes at
`completed` — the edit form, adding turns and re-crewing refuse from there, because commission is
computed at that rung. The notes and the belongings stay editable until `return_to_pawrents`.

**Every move confirms**, because none of them can be undone. The dialog says which rungs a jump
fills in behind it, and that completing here is not being paid.

### Reschedule

`BookingRescheduleDialog`, in the same menu, while the animal has not arrived and the booking is
not a draft. **It is not the edit form** — that re-prices; this is `POST /bookings/:id/reschedule`,
which writes the date. The booking comes back `confirmed`, and `rescheduled` goes to the trail. A
clash offers an override only after the diary has refused. **One booking at a time**: a group is
rescheduled booking by booking in this phase.

**Cancelling asks for a reason and does not require one**, gated on `bookings:cancel`; forward
moves take `bookings:advanceStatus` **or** `bookings:update`.

---

## The groomer went on leave after the booking was made

Book Thursday with Sinta; then mark Sinta off on Thursdays. The roster screen warns (kriteria 4.9)
once. The booking itself now remembers: every person on a session carries `offReason`, **computed
on read** — leave is set AFTER a booking is made, so a flag stamped at write time would be stale
exactly when it matters.

**It says what to do** — *ganti groomer atau hubungi pelanggan* — **and refuses nothing.** The
calendar block carries a ring and `⚠ Groomer libur`, with the sentence in its `title`.

---

## The trail

`statusHistory[]` comes back on every booking: `{ status, at, by, byName, byRoleName, implied }`,
oldest first. `BookingHistoryCard` draws it **newest first** as a timeline in the rail — it sits
open beside the work and is glanced at for *what just happened*.

**A skipped rung is still a rung the booking passed through**, stamped with the same instant and
drawn as *otomatis*. **`byName` null means nothing human moved it** — "Sistem". **Whoever moved it
is named with their role** through `bookingActorLabel`, the one formatter the card and the page's
audit line share. **The first line is `Booking dibuat`**, from `createdAt`, and it is not a status.
**The current entry is ringed in navy, not orange** (§4). **An empty trail means not recorded,
never never moved.**

---

## Reading it

The list defaults to **everything**, not to today. The first question anybody asks this screen is
"did that grooming I just rang up actually get recorded", and an empty list filtered to a day they
have not thought about reads as "no". "Hari ini" is the date filter's first preset.

**`?groupId=` is read on arrival** — it is where a save that made several bookings lands — and
shown as a removable **Satu kunjungan** chip. Removing it clears the filter and the address.

The status filter, the badge labels and the menu all run in **ladder order**.

---

## Tests

`src/tests/BookingForm.test.tsx`, `bookingDraft.test.ts`, `BookingDetailScreen.test.tsx`,
`BookingPetWorkRedirect.test.ts`, `BookingStatusActions.test.tsx`, `bookingStatusFlow.test.ts`,
`BookingNotesCard.test.tsx`, `BookingBelongingsCard.test.tsx`, `BookingHistoryCard.test.tsx`,
`SessionAlbum.test.tsx`, `SessionRecord.test.tsx`, `BookingsScreen.test.tsx`,
`BookingsTable.test.tsx`, `BookingCalendarScreen.test.tsx`, `booking.service.test.ts`. The
backend's half is `booking.service.test.js`, `booking.api.test.js` and `booking.model.test.js`.

---

## One rule the form keeps that is easy to lose in a refactor

**Chrome must never be able to fail a save.** The success toast used to sit inside the same `try`
as the request; the toast library threw, the catch turned it into "Terjadi kesalahan. Coba lagi.",
and a booking that had ALREADY been written was reported as a failure — which sends somebody to
make it a second time.

The order is: write, reset, navigate, *then* announce — and the announcement has a catch of its
own. `BookingForm.test.tsx` pins it.

---

## Kalender — `/dashboard/booking/kalender`

**Satu blok adalah satu SESI, bukan satu booking.** Mandi oleh Sinta lalu blow dry oleh Rio adalah
dua blok di dua kolom; keduanya membawa `bookingId` yang sama, dan mengklik mana pun membuka
`/dashboard/booking/:id`. Booking yang belum punya sesi tetap digambar satu blok.

**"Belum ditentukan" adalah kolom, paling kanan.** Membuangnya menyembunyikan pekerjaan yang masih
perlu diberi orang.

**Warna tidak pernah jadi satu-satunya pembeda**: setiap blok membawa statusnya sebagai teks, dan
legendanya selalu terlihat.

**Blok tanpa durasi digambar satu slot dan berkata "durasi belum diisi".** Mengarang panjangnya
menaruh angka yang tidak dipilih siapa pun di kalender.

### Tanggal di layar ini adalah sumbunya, bukan field

`toISOString().slice(0, 10)` — yang ditulis di tempat lain di aplikasi ini — salah di sini. Ia
mengonversi ke UTC lebih dulu, jadi di timur Greenwich tanggalnya **mundur**: di Jakarta
`addDays("2026-09-02", 1)` kembali sebagai `"2026-09-02"`, dan tombol "berikutnya" tidak
memindahkan apa pun. Gunakan `localDate()` di berkas ini.

---

## Cabang: asked, never inherited

The booking form and the calendar both take their branch from a picker on the screen, not from
`session.currentBranchId`. **That session field is the TILL's idea of a branch** — a terminal
stands in one shop all day. Everything else that writes a document in this app asks on the form.

Both screens use `useBranchScope`, so **one branch fills itself in** and no picker appears. The
first version inherited the session branch, and the cost was a booking quietly filed to whichever
branch the session happened to point at, invisible until somebody reconciled a branch's takings.
