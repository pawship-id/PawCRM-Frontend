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
| **Built** | A column for a groomer who is **in but has nothing booked**, on the daily view — labelled `· kosong` |
| **Built** | Each column's **load** — `· 4j 30m terisi`, or `· kosong` |
| **Not built** | Capacity as a ceiling — see below |

**THE EMPTY COLUMN, AND WHY IT TOOK THE ROSTER TO BUILD.** A calendar showing only
busy people cannot answer the question a receptionist brings to it — "siapa yang
bisa ambil anjing jam dua" — because the one person who can is exactly the one
with no blocks.

**Only on a single day.** "Who is in" is a per-day fact; a week has no single
answer, and the weekly view asks "which day is full" anyway.

**Who counts as a groomer is `users.isGroomer`.** It was derived from work already
assigned for one release — the least-bad guess available while nothing recorded
the fact, and one that could not see a groomer hired last week. The derivation was
**removed** rather than kept as a fallback: two sources for one question is how
they come to disagree.

**Somebody off today gets no column.** A column is somewhere to drop work, and
dropping work on somebody on leave is what FR-4 refuses outright.

**LOAD, NOT CAPACITY, AND THE DIFFERENCE IS THE POINT.** "Capacity" would mean
announcing a limit — "Sinta can take 8 hours" — and nothing in this system knows
anybody's working hours. A groomer on half days, one who stays late on Saturdays,
one who is training somebody: each has a different ceiling and none is written
down. So the header reports what IS booked and lets the shop judge. A wrong
ceiling would be worse than no ceiling, because somebody would start refusing work
against it.

**A row with no duration counts as one slot** — the same assumption the grid draws
it with. Counting it as zero would make a day of untimed work look empty, which is
the one reading that gets somebody double-booked.
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

## Why the list took over the first half of a booking's life — and gave it back

The table was built read-only, on the argument that every legitimate change ran through the
till. What that missed is that **the till only ever sees the END of a booking**. An animal
arriving and a groomer starting are facts nobody could record anywhere, and the person who
knows them is the receptionist watching the door — who has this screen open, not the kasir.

So the moves went onto the row. **They came off it again on 5 September 2026**: the kebab stays,
and holds one item — **Detail booking**.

**The ladder outgrew the row.** Nine rungs, two conditional on the booking, and guards that
refuse `completed` until every session is finished: the kebab had grown to seven items and was
answering questions — *can this one be handed over yet? which sessions are still open?* — whose
evidence is on the detail page and nowhere near the row. Moving a booking from a list is a
decision taken without looking at the thing being decided about.

**It also made the commonest mistake the easiest one.** The kebab sits under the pointer at the
end of every row, and *"Tandai selesai dikerjakan"* on the wrong row fires commission for the
wrong visit. The ladder only runs forward — there is no undo, only a cancellation and a new
booking.

**The kebab itself stayed.** What was wrong was what it held, not that it was there: every other
table in this app ends in the same button, and a booking row ending in a bare link would be the
one row somebody has to look at twice to find the actions on, down to the vertical dots every
other table uses.

The receptionist's need is unchanged and is met one click away: the row's number and the menu's
**Detail booking** both open the booking, where the moves are, next to what they are about.

---

## Making one

`BookingForm` asks in §16's field order, and since the per-animal flow landed that order is:
**kapan** (tanggal + jam) → **di mana** (cabang, lokasi layanan) → antar-jemput → **dengan
siapa** (pelanggan) → a card per animal → catatan last. **There is no status field** — see
below.

### The page is four cards and one list

`Jadwal & lokasi` · `Antar-jemput` (only for a salon visit) · `Pelanggan` · **the animals** ·
`Catatan`. Each card is a `<Card>` — white `bg-surface` on the page's tint — so a form
with two dozen controls has somewhere for the eye to stop.

**The animals are the one group NOT wrapped in a card**, and that is deliberate: the ANIMAL's
card is the white card there. White cards inside another white card leave the middle level
doing nothing — a border around a border — and the hierarchy that reads is:

```
page tint
└── white card per animal          ← bg-surface, tinted header strip
    └── tinted inset per service   ← bg-background, the page's own colour
```

The inset inverts the usual card-on-background, which is the only way to nest twice without
the borders doing all the work.

### The card is titled by its animal, and that is the whole layout

The first version was flat: a small grey caption over eight controls, repeated per animal. The
question it produced from the first person to use it was *"ini input buat hewan 1 atau hewan
2?"* — and a form somebody has to keep their place in is a form that gets filled in wrong.

What answers it now:

| | |
| --- | --- |
| A tinted **header strip** with a numbered badge and the animal's name as an `<h3>` | The eye finds where one animal ends and the next begins without counting borders |
| `Hewan ke-2` until one is chosen | A card with no animal yet still says which one it is |
| The services sit behind a **left rail** | The indent says "these belong to the animal named above" without repeating it on every row |
| **Tipe layanan** moved down beside the service list | Next to *Hewan* it read as another property of the animal, and was half the confusion |

### The status is the button, and there is no field for it

The form had a **Status** select — `requested` / `confirmed` / `draft`. Two buttons replaced it
on 5 September 2026, and it is worth stating because it REMOVES a control:

| Button | Saves as | Blocked while required fields are empty |
| --- | --- | --- |
| **Simpan booking** (primary) | `requested` | Yes — with `blockedReason` saying which field |
| **Simpan sebagai draf** (secondary, left of Batal) | `draft`, always | **No** |

**A select asked the wrong question.** "Which status should this start in" is not what somebody
writing down a phone call is deciding; what they are deciding is **whether they are finished**.
That is what a button answers, and a field that must be read and understood before every save is
one people leave on whatever it happened to say last.

**It was also a third place for one fact.** The ladder is enforced by the server and offered by
the booking's own status menu; a select at creation time was a second door into the same
machine — one that could put a booking into `confirmed` with nobody at the shop agreeing to it.

**The draft button is not blocked by `blockedReason`, and Simpan is.** A draft is exactly what
you save when the required fields are NOT answered — a phone rings mid-booking, a customer is
not sure which day — so gating it on the same rule would make it useless in the one situation it
exists for. It is off only while nothing could be sent at all (no customer picked); the server
still refuses a booking with no animal on it, because a draft is unfinished, not unfounded.

**It is not offered when editing.** `PATCH` carries no status, and pushing a live booking back
down to a draft is a move the ladder does not have. An existing draft stays a draft on save and
is promoted from the booking's own status menu.

### Three things are folded away

A visit is usually one animal, one service, the catalogue's duration, no note and nothing
handed over — so the three controls that are usually left alone are behind a fold, and each
fold says when it holds something:

- **Durasi** is a button showing the catalogue's number (`Durasi 90 mnt · ubah`). A
  receptionist disagreeing with the catalogue is the exception; the box was in the way of every
  booking that agreed with it.
- **Catatan & barang bawaan** is one disclosure per animal, with a count when it holds
  anything, and it **opens by itself** when the booking already has something in it — editing
  must not hide what was written last time behind a fold nobody knows to open. It holds the
  animal's **two** notes since 5 Sep 2026, and **each counts as one** in the badge: counting the
  pair as a single item would hide that a customer note was written and an internal one was
  not, which is exactly the distinction the fold must not obscure.

Nothing was removed. It stopped being in the way.

### The card is per ANIMAL, not per line

It used to be per line: one card meant one animal having one service, so a dog having a bath
and a nail trim was two cards, each repeating the animal, the groomer and the note. The
questions a receptionist actually asks run the other way — *which animal, then what is being
done to it* — and the business-line filter, the note and the belongings list are all facts
about the ANIMAL, asked once instead of once per service.

Inside a card: the animal, its **groomer** (one default for the whole visit), then a numbered
list of services. **One service line reads top to bottom in the order it is answered:**

```
Layanan 1                                    [×]
  [ Tipe layanan ▾ ]     [ Layanan ▾ ]        ← the second is narrowed by the first
  Rp 180.000 · varian Besar
  Add-on
    ☐ Parfum   Rp 20.000 · +10 mnt            ← only what THIS service offers
  Durasi 90 mnt · ubah
```

**The type filter is per LINE, not per animal.** One visit may take a Grooming service and a
Hotel one, which a single filter per card could not say — and asked once per card it read as a
property of the animal rather than of the list it narrows. Changing it **clears the chosen
service**: leaving a name the list below no longer offers is worse than asking again.

**The word "Layanan" appears once per meaning.** The list is headed `Daftar layanan`; each
entry is `Layanan 1`, `Layanan 2`. The first version had the section and the select inside it
both labelled "Layanan", a few pixels apart, meaning different things.

**The form's shape is not the API's, and `bookingDraft.ts` is the only place the two meet.**
The API stores a flat list of rows — add-ons included, each with `parentItemId` — which is
right for the calendar, the clash check and the commission run. The screen holds a tree.
`groupsFromBooking` folds add-ons back under their parent on load; `groupsToItems` flattens
them out on save. It is tested directly (`bookingDraft.test.ts`) because the property that
matters — **load a booking, change nothing, save it back unchanged** — is invisible to a
rendering test: it would pass while quietly dropping every add-on, and the loss would show up
on the bill.

### The groomer is asked once per animal, and settled per session

**On the form: one default per animal.** It used to be asked once per service, which is the
wrong number of times — at booking a shop says "Sinta is doing Bruno today", not one name per
line. The answer is written onto every one of that animal's sessions.

**On the booking's own page: per session, and more than one.** Each session can be handed to
somebody else, or gain a second pair of hands — `SessionGroomers`, in the expanded row of the
per-animal work page, where the day is running and the person who knows is standing at the
table.

| | |
| --- | --- |
| The **lead** (`groomerUserId`) | Who is responsible — **and the only one commission is computed for** |
| **Groomer tambahan** (`assistantGroomerUserIds`, max 4) | Counted busy by the clash check, paid nothing |

**That split is said out loud on the screen**, not just in the schema: the lead's field says
"yang dihitung komisinya", and adding somebody says they are counted busy and not paid. A
screen that let people add "groomers" without saying so would be quietly deciding how a shop
splits money — and the natural implementation would have been worse than quiet. Making the
lead an array runs into `commissionrecords`' unique index on `bookingItemId`, where the second
person's record is refused by the database and swallowed as success: never paid, nothing on
screen, nothing in a log. See `bookingitems` in the backend's `database.md`.

**Helpers with no lead are refused** on both sides — `advanceItemWork` will not start a session
with no `groomerUserId`, so such a row would look staffed and behave unstaffed.

### The price follows the animal

A service priced per variant is quoted from the pet's own **species, size and coat** — the
card shows the number and which variant it came from ("Varian Besar"), and the bar's total
agrees with it.

**When the animal's record is missing the fact the price varies by, the card says which fact,
Simpan is disabled naming the animal, and the message carries a link to that pet's edit page.**
It never falls back to the cheapest or the middle variant: the server would refuse the save
anyway, and a number on screen that the save contradicts is worse than no number.

**That link opens in a new tab**, the same way `ProductForm` links out to the product holding a
taken barcode — this form holds unsaved state and no draft, so navigating away would lose the
customer, the animals and every service ticked so far.

**And coming back is enough.** The animals are re-read when the tab becomes visible again, so
a coat length filled in next door prices the service without a reload. Picking an animal
re-reads them too, but that only helps when the *selection* changes — the animal just corrected
is already selected, so choosing it again fires nothing. `visibilitychange`, not `focus`: focus
fires for a dropdown closing or a devtools click, which would put a request on the wire for
nothing.

**The refresh is deliberately quiet** — it writes `pets` and touches no loading flag. The
loader that runs when a customer is picked swaps the whole list of animal cards for a spinner,
so refreshing through it would blank the services ticked and the notes typed, on a form
somebody is in the middle of. A dropped request keeps the last good list rather than emptying
a picker in use. The rule is mirrored from the server
(`utils/serviceVariant.ts` ↔ `utils/serviceVariant.js`) — a preview, with the stored answer
still the server's, the same trade "selesai sekitar" already makes.

### Add-ons

Ticked underneath the service they belong to, from **that service's own list** — the server
refuses anything outside it, so offering more here would be a tick that fails on save. They
are never in the main service dropdown: an add-on booked on its own is refused too.

Sent as `addonServiceIds` on the parent; stored as rows. An add-on takes the parent's animal
and groomer, and its own price and duration from the catalogue — so "+10 mnt" lengthens the
visit by exactly what the catalogue says, and the finish-time preview counts it against the
groomer doing it.

### Lokasi, antar-jemput, barang bawaan

| Field | Shape | Note |
| --- | --- | --- |
| Lokasi layanan | `in_store` / `in_home` | Narrows the catalogue: a service that cannot be done at home is refused for a house call |
| Antar-jemput | Two check-rows + an optional address | **One trip per visit, not per animal** — a van goes to an address, and two of one customer's dogs ride in the same one. The question **disappears** on a house call rather than being asked and ignored; the server forces both off |
| Barang bawaan | Add-and-remove chips, per animal | What the owner says they will bring. **Nothing here ticks anything in** — the counter confirms arrival on the animal's work page, and a visit cannot be completed while something handed over is still here |

### Two notes per animal, and one for the whole visit

Inside each animal's fold there are **two** boxes, added 5 September 2026:

| Field | Label | Who reads it |
| --- | --- | --- |
| `internalNotes` | **Catatan internal** | Staff only, never the customer — "takut hairdryer, mandi duluan". This is the old `notes`, renamed |
| `customerNotes` | **Catatan untuk pelanggan** | The owner — "bulunya kusut parah, disarankan grooming tiap 3 minggu" |

**One box could not serve both.** Everything went into a single "Catatan": handling
instructions next to whatever somebody wanted the owner to know. Whichever way that box is then
treated it is wrong — shown to the customer, "pemiliknya suka ngeyel soal harga" leaks; hidden
from them, the advice never arrives.

**The labels are the feature, not the storage.** Splitting the fields without saying which is
which on screen would change nothing: the person typing decides where a sentence lands, so the
label has to answer *who reads this* before the cursor gets there. The internal one is first
because almost every visit has one and the customer's is the exception. The customer box's hint
says out loud that **nothing prints it on a struk or sends it over WhatsApp yet** — a field
that looks like it reaches the owner but does not is worse than one that is honest, because
somebody would write "sudah kami hubungi" in it and assume the customer had been.

**Both are written onto each of the animal's rows.** They are per-animal facts that happen to
be stored per row, because the row is the only thing a visit has one of per animal per service.
Asking once and fanning them out is what makes the screen match the fields' own meaning; asking
once per service would put the same sentences in front of somebody three times. `groupsFromBooking`
collapses them back, and it tests each **independently**: a booking whose rows disagree — one
written before the split, or an edit that reached only some rows — must show both halves, and
testing them together would silently drop whichever the first row happened to lack.

**The booking's own Catatan is unchanged** — one note for the whole visit, `bookings.notes`,
still a single box at the end of the form.

**Where they are read back:** on the **animal's own work page**, in the card that also edits
them (below), and nowhere else on the booking. The overview carried a read-only copy per animal
block for a day and it was dropped: a second place to look for words that can only be changed
in the first is a place somebody reads and then wonders why they cannot correct. The calendar
block and the pet timeline show the **internal one only** — a day sheet and a handling history
are staff surfaces, and the API does not send the customer's note to either.

`BookingNotes`, the read-only labelled pair, was deleted with its last call site rather than
left as a component nothing renders.

### Editing them from the animal's work page

`BookingPetNotesCard` sits at the head of the rail on `/dashboard/booking/:id/hewan/:petId` —
"Catatan booking", with **Untuk pelanggan** above **Internal**, both editable in place.

**Why they are editable there and not only on the form.** The booking form captures what was
known when the appointment was taken. Everything else is learned afterwards: the coat is worse
than it looked, the dog panics at the dryer, the owner says something at drop-off. All of that
happens on this page, and the alternative was sending a groomer with wet hands to the edit
form — which reprices the visit on save.

**It is `PATCH /bookings/:id/pets/:petId/notes`, never `PATCH /bookings/:id`.** The wholesale
edit re-snapshots every unbilled row at today's catalogue price, so saving a note through it
would reprice a visit nobody meant to reprice. This is the one thing about this card worth
remembering.

**Saved on blur, one field at a time**, matching the time fields on the same page — no save
button. Each box sends only itself: the other may be half-typed, and a patch carrying both
would write a stale value over live editing. A blur that changed nothing sends nothing, because
tabbing through a card is the commonest thing that happens to it.

**The draft is local and reseeds when the stored value moves.** A textarea driven straight off
`booking` fights the person typing; without the reseed a save from another tab would never
show. It is also what makes a refusal recoverable — the box keeps the words and the error says
why they are not saved yet.

**In the rail, and read-only without `bookings:update`.** It is consulted while something else
is being done — during the work, and again at hand-over — so it stays in view beside the
sessions instead of scrolling away above them. Somebody without the grant sees the text, not
disabled boxes: they are reading the page, not being stopped mid-act.

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

**On the booking's own page, not on the list** — `/dashboard/booking/:id`, and on the animal's
work page for the per-session moves. See above for why the row gave them up.

The kebab menu offers exactly the transitions the server allows from where the booking stands —
`statusFlow.ts` mirrors `booking.model.js` so the menu cannot offer a move that comes back a 409.

```
draft ─► requested ─► confirmed ─► [pickup] ─► arrived ─► in_progress ─► completed ─► [delivery] ─► return_to_pawrents
  │          │            │           │           │            │
  └──────────┴────────────┴───────────┴───────────┴────────────┴──► cancelled
```

**The ladder is a function of the BOOKING, not a constant** — `ladderFor(booking)`. The two
bracketed rungs exist only on a visit that asked to be fetched or driven home, so a menu built
from the status alone would offer *"Mulai penjemputan"* on a booking with no van, and the
server would refuse it one 409 at a time. Everything that reasons about order — the menu, the
implied-rungs warning, the primary button — takes the booking.

**`requested` is where a saved form lands, and `confirmed` is a separate act.** A booking that
confirmed itself was one nobody had checked: a receptionist writing down a phone call has not
yet asked whether the shop can take it. Confirming has a rung and a button of its own on the
booking page. The walk-in standing at the counter is one click further away than before, and
that is the trade.

**`completed` is no longer the end**, and the split it created is the thing to remember on this
screen. Money closes at `completed` — the edit form and the groomer pickers refuse from there,
because commission is computed at that rung. The animal's own things — its two notes, its
belongings — stay editable until `return_to_pawrents`, because that is when the visit ends.

**Every move confirms, including the ordinary ones**, because none of them can be undone:
the ladder only runs forward, so a mis-tapped "Tandai selesai" is not a click somebody takes
back. There is no way back down the menu either — a booking checked in by mistake is
cancelled and made again.

The dialog is also where the two things worth saying fit:

- **Which rungs the jump fills in behind it.** Straight to arrival also records *Diminta* and
  *Dikonfirmasi*, at the same minute — see below. A trip leg the booking never booked is never
  filled in.
- **That completing here is not being paid.** The till stamps the sale when money lands;
  marking it done only says the work is finished, and a completed booking stops being offered
  to the kasir.

### Jadwalkan ulang

`BookingRescheduleDialog`, in the same kebab menu, offered while the animal has not arrived and
the booking is not a draft.

**It is not the edit form.** Saving that RE-PRICES every unbilled row at today's catalogue
price — changing what is being done is a new quote — so moving a date through it would bill a
shop's price rise to a customer who only rang to say Thursday is off. This calls
`POST /bookings/:id/reschedule`, which writes two fields.

**The booking comes back `confirmed`, and `rescheduled` goes to the trail.** Agreeing a new
time is a confirmation; a booking parked in a status of its own is one somebody has to remember
to un-park. It is the one trail entry that can appear twice.

**A clash offers an override, and only after the diary has refused.** A checkbox that is always
there is one people tick out of habit. The warning says what the override costs — *"groomer itu
akan punya dua pekerjaan di jam yang sama"* — and changing the time clears it, because a stale
warning turns the next save into an override nobody meant to make.

**Gated on `bookings:update`, not `cancel`.** Rearranging a day is an edit to what was agreed;
gating it on the cancel grant would mean a receptionist who may move bookings cannot, while one
who may only end them can.

**Cancelling asks for a reason and does not require one.** A receptionist calling off an
appointment at the customer's request has nothing to add, and a mandatory field with nothing
to say gets filled with "-". It is gated on `bookings:cancel`, while the forward moves take
`bookings:advanceStatus` **or** `bookings:update` — the split the permission catalogue makes.

**`advanceStatus` is the groomer's grant, added 3 September 2026.** It was one grant with
`update` while `update` had no screen: nothing called `PATCH /bookings/:id`, so giving a
groomer `bookings:update` meant, in practice, "may check a dog in". The edit form changed
what that sentence means overnight — the same grant now opens a screen that changes the
services and re-quotes every unbilled row at today's prices. A permission whose safety rests
on a missing button gets more dangerous the more you build.

---

## One animal's work — `/dashboard/booking/:id/hewan/:petId`

`BookingPetWorkScreen`, reached from a "Pekerjaan <nama>" button on each animal's block on
the detail page. Added 3 September 2026, from the shop: **"Mochi sudah selesai mandi tapi
Coco belum" was a sentence the booking-level status alone could not hold.**

**`bookingitems` gained `workStatus` (`pending → in_progress → done`), `startedAt` and
`finishedAt`.** Three rungs, not the booking's nine — `draft` and `arrived` are facts about
the VISIT (an appointment agreed, an animal arriving), not about one service, and copying the
booking's ladder onto every row would mark an animal "arrived" twice because it is having two
things done.

**The booking's own `in_progress`/`completed` now follow the rows rather than being set
directly** — `BookingService#deriveBookingStatus`, fired every time a row moves. `draft`,
`confirmed`, `arrived`, the two trip legs, `return_to_pawrents` and `cancelled` stay the
booking's own, manual as before.

### The header carries the one booking-level action on the page

`BookingStatusActions` gained a `variant="prominent"` — same dialog, same confirm step, same
audit trail, same server guard as the compact ellipsis menu used on the day sheet and the
overview page. A primary button for the very next rung (`forward[0]`, since
`BOOKING_TRANSITIONS[status]` is written in ladder order), and a secondary "Status lain"
trigger for the skip-ahead moves, history, and cancel.

**A red line above the button warns before it is pressed** — which animal is still
unfinished, mirroring what the server would answer with a 409 if pressed anyway. It is a
courtesy; the guard lives on the server (see `PATCH /bookings/:id/status` in `docs/api.md`
for the money bug this closed).

Cetak links to the printable pet card (kriteria 5.12, a real destination). WhatsApp
normalises the customer's phone — stored locally (`0812…`), not E.164 — into a `wa.me` link,
and is not rendered at all when the number cannot be normalised into something plausible.

### The subtitle line: who made it, when, in what role

Below the pet name, the line reads `Dibuat {created date/time} · {creator name}
({creator role}) · {booking number}` — e.g. `Dibuat 3 Sep 2026 11.52 · Fitria (ops) ·
ODR-1308`. Changed 3 September 2026, replacing a line that only repeated the booking
number and status already shown above it.

`Booking.createdBy` was written from the start but never read anywhere; `createdByName`
and `createdByRoleName` are resolved server-side in `withNames`, batched the same way as
groomer and customer names, via a new `RoleRepository.findNamesByIds`. Neither is stored
on the booking document — both are looked up fresh, so a later name or role change is
reflected automatically. When the creator has no role (a deleted user, a super-admin with
none) or the booking has no `createdBy` at all, the parenthetical or the whole segment is
left out rather than showing a placeholder.

The back-arrow button that used to open this card is gone. The booking number in the
subtitle is now a link back to `/dashboard/booking/:id` — the page's only way back.

---

## Titipan owner — centang masuk dan keluar

**The card lives on the animal's page**, `/dashboard/booking/:id/hewan/:petId`, in the left
column **above Sesi Grooming**. What the owner handed over is checked at the two moments that
bracket the work — arrival and collection — so it is read before the sessions and again after,
while the sessions in between are worked through once. Sessions are also the longest card on
the page, and anything under them is found only by scrolling past everything. A three-column
table — **Barang / Masuk / Keluar** — showing only
that animal's things, with a `N belum kembali` badge in the card header and **Tambah barang**
underneath. Two checkboxes per item: **Masuk** when it is handed over at the counter,
**Keluar** when it goes home.

**It used to be on the booking overview, grouped by animal, and moved on 5 September 2026.**
Handing a collar back happens at the table next to the animal it belongs to and the person
holding it; the overview is about what the whole visit is and what it comes to. One card
covering three animals meant scrolling past two others' things to tick one.

**The count stayed behind.** Each animal's block on `/dashboard/booking/:id` carries
`N titipan belum kembali` and the button through to the page. "Is anything still in the
drawer" is the last question asked before a visit closes — a whole-visit question — so the
answer must be readable without opening three pages. The **list** moved; the **number** did
not. There is deliberately only one place to tick: two copies of the same checkbox is how an
item gets recorded as returned and then quietly un-returned.

**Tambah barang defaults to checked in.** Somebody arrives with more than they said they
would, and an item written down at the counter arrived in the same movement that recorded it.
It is `POST /api/bookings/:id/belongings`, which appends server-side — not the wholesale
`PATCH` of the whole array, for the same reason the ticks are per-item. A refusal leaves the
typed name in the field: making somebody retype it is where the typo goes in.

**Two ticks, not one.** A single "sudah dikembalikan" cannot tell apart the two states that
matter — something written down when the booking was taken and never actually handed over, and
something handed over and still in the drawer. Only the second holds a visit open, and a shop
ticking "returned" on things that never arrived would train itself to ignore the warning.

| Rule | Where it lives |
| --- | --- |
| Keluar is not tickable before Masuk | The box is disabled; the server also refuses it with a `409` naming the item |
| Unticking Masuk clears Keluar | Server — a correction must not leave an item recorded as returned when it never came |
| A visit cannot be completed while something is still here | Server, and the card shows the same sentence so the two never disagree |
| Something that never arrived is **not** outstanding | Both — it is the whole reason the stored shape carries two dates |

**One request per tick**, against that item's own id — never a save of the whole list. Two
counters handing back two animals' things at the same moment would otherwise overwrite each
other, and the loser is an item recorded as returned and then quietly un-returned.

**The row reflects the server, not the click.** Nothing is ticked locally and reconciled
afterwards: the request goes, the booking comes back, and the page redraws from it — so a
refusal leaves the box exactly as it was rather than flicking and flicking back.

**Without `bookings:update` the boxes are marks, not controls.** Somebody reading the page is
not being stopped mid-act, and a row of dead checkboxes reads as broken; the state still shows.

---

## The groomer went on leave after the booking was made

Found during the BO's own testing, 3 September 2026.

Book Thursday with Sinta; then mark Sinta off on Thursdays. The roster screen
warns (kriteria 4.9) — **once**, and it is gone when the page closes. The booking
remembered nothing: on Thursday morning it still read "Sinta", and the only person
who knew was whoever had ticked the box days earlier.

Every booking row now carries `groomerOffReason`, **computed on read**. Leave is
set AFTER a booking is made — that is the entire problem — so a flag stamped at
write time would be stale exactly when it matters. It costs no extra query:
`withNames` already fetches the groomers, and the projection gained `availability`.

**Shown in both places, differently.** The detail page carries the sentence and the
remedy; the calendar block carries a ring and `⚠ Groomer libur`, with the sentence
in its `title` — a block is small and often truncated, so the outline is what reads
at a glance across a full day.

**It says what to do**, not merely that something is wrong: *ganti groomer atau
hubungi pelanggan*. There are exactly two remedies, and naming them is the
difference between a notice and a task.

**It refuses nothing.** A system that voided the appointment would be taking a
decision that belongs to the shop.

---

## The trail

`statusHistory[]` comes back on every booking: `{ status, at, by, byName, byRoleName, implied }`,
oldest first. It is drawn **twice**, deliberately differently:

| Where | Shape | Order |
| --- | --- | --- |
| `BookingHistoryCard` — the rail on `/dashboard/booking/:id/hewan/:petId` | A timeline: a dot per entry, a line joining them, the current one ringed | **Newest first** |
| `BookingHistoryDialog` — `Riwayat status` in the booking's own status menu | A list: status badge, mover, time | **Oldest first** |

**The opposite orders are not an oversight.** The card sits open beside the work all day and is
glanced at for *what just happened*; the dialog is opened on purpose to read the visit as a
story, and a story starts at the beginning.

**Why it exists.** `status` says where a booking stands and nothing about how it got there,
and `updatedAt` answers only the last move because the next one overwrites it. *"Jam berapa
hewannya datang"*, *"sudah dikonfirmasi sebelum datang atau langsung datang"* and *"siapa
yang membatalkan"* have nowhere else to come from.

**A skipped rung is still a rung the booking passed through.** Nobody hands over a dog for an
appointment that was never agreed, so `draft → arrived` records *all of them*, stamped with the
same instant. The filled-in entry carries `implied: true` and the dialog draws it as
*otomatis* — two entries at the same second would otherwise claim two separate decisions, and
this says which one somebody actually made.

**`byName` is null when nothing human moved it** — a booking settled by a paid sale — and both
renderers say "Sistem" rather than leaving a blank that reads as a field that failed to load.

**Whoever moved it is named with the hat they were wearing** — "Fitria (ops)", "Sinta
(groomer)". A trail is read after the fact by somebody who was not there, and a bare name
assumes they know who Fitria is; the question actually being asked is whether the person was at
the counter or at the table. `bookingActorLabel` in `features/booking/format.ts` is the single
formatter — the card, the dialog and the work page's own audit line all go through it, because
three renderings of one label is how "Fitria (Staff)" and "Fitria (staff)" ended up a few
centimetres apart. **`byRoleName` can be null when the name is not**: the seeded Owner reaches
every permission by bypass rather than an assigned role, and the name alone is honest where
"(admin)" would be a guess.

**The card's first line is `Booking dibuat`, and it is not a status.** It comes from
`createdAt` / `createdByName`, because `statusHistory` records only MOVES — without it the
trail begins at "Dikonfirmasi" and reads as though the booking sprang into existence already
confirmed. It is also why a booking whose trail predates the feature still shows one honest
line instead of an empty card.

**The current entry is ringed in navy, not orange.** The reference draws it orange; ui-rules §4
spends orange on one meaning — a human must act — and on that page it is already spent on the
status badge while an animal is on the table. Two orange things at once means one of them is
wrong, and "this is the most recent line" is not a call to action.

**The statuses are shown in Indonesian**, through `BOOKING_STATUS_LABELS`. The card used to
print the API's own values — `Status → in_progress` — at a shop.

**An empty trail means *not recorded*, never *never moved*.** Bookings made before the field
existed carry one, and the empty state says so rather than implying the booking sat still.

---

## Reading it

The list defaults to **everything**, not to today. The first question anybody asks this
screen is "did that grooming I just rang up actually get recorded", and an empty list
filtered to a day they have not thought about reads as "no". "Hari ini" is the date filter's
first preset.

The status filter, the badge labels and the menu all run in **ladder order** — confirmed
before arrival. A picker that lists a booking's life out of order is one people read twice.

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
