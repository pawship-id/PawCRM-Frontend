# Booking

`/dashboard/booking` — the day sheet, plus the two things that were missing from it: making
a booking, and moving one along.

Backend: `/api/bookings`. Feature: `src/features/booking/`.
The POS side of the same collection is [`booking-bridge.md`](./booking-bridge.md).

---

## What it does now, and what it deliberately does not

| | |
| --- | --- |
| **Built** | The list — filtered by day, status and origin, sorted as a day sheet |
| **Built** | `BookingCreateDialog` — take a booking for a customer, an animal and one or more services |
| **Backend only (FR-1)** | A booking may hold **several animals**. The API accepts it; the dialog still asks for one — that is FR-2 |
| **Built** | `BookingStatusActions` — move it along the ladder, or call it off |
| **Built** | `BookingHistoryDialog` — when it reached each status, and who took it there |
| **Not built** | A calendar, a groomer roster, capacity, clash detection |
| **Not built** | Editing a booking — rescheduling, changing the services, swapping the animal |

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

**Still one animal in the create dialog.** The API takes `items[].petId` and would accept
several, but the dialog has not been rebuilt yet — that is FR-2, and it is a rebuild of a
752-line component the POS bridge also uses, which is why it is its own phase.

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
