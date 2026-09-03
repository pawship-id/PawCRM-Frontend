# Service Catalog

Master Data → **Layanan**. What a tenant sells the *doing of* — grooming, penitipan,
vaksinasi.

Backend: `PawCRM-Backend/src/models/service.model.js` and the `/api/services` routes.
Fase 3 of the POS module.

---

## Screens

| Route | Component | Permission |
| --- | --- | --- |
| `/dashboard/master/layanan` | `ServicesScreen` | `services:read` |
| `/dashboard/master/layanan/new` | `ServiceForm` | `services:create` |
| `/dashboard/master/layanan/[id]` | `ServiceForm` (with `serviceId`) | `services:update` |

Placed beside **Hewan** in Master Data rather than under Inventory → Produk. The split is
about **who edits**: the groomer who prices a bath is not the person pricing sacks of feed,
and the RBAC catalogue makes the same split with a `services` feature of its own.

---

## The price box takes digits only

The API accepts four decimal places. This form refuses all of them, and that is the single
most important thing in the feature.

**In Indonesian, `.` is the thousands separator.** Somebody typing `150.000` means a
hundred and fifty thousand. Read as a decimal it is **150 rupiah** — and it would be stored
silently, with the form showing exactly what they typed and the list showing `Rp 150`.

Allowing sen would not fix it, because the mistake cannot be told apart from the intent:
`150.000` is a valid three-decimal amount *and* a valid mistyped hundred-fifty-thousand,
and no rule reads the writer's mind. Refusing the character removes the ambiguity instead
of guessing at it.

Nothing is lost. `formatMoney` rounds to whole units on the way out — *"nobody prices in
sen"* — so a fractional price would be invisible everywhere it was later displayed.
Accepting input the UI then hides is worse than refusing it.

> This was caught by a test, not by review. The first version validated with `isDecimal`,
> which accepts `150.000` happily. `ServiceForm.test.tsx` holds the rule now, for `.`, `,`
> and a leading `-`.

**The price is a string end to end.** Typed as text, validated as digits, sent as written,
never `Number()`-ed anywhere in the feature. `JSON.parse("199999.99")` is already not
`199999.99` before any of our code runs.

`inputMode="numeric"` rather than `type="number"`: a number input in some browsers silently
reformats what was typed, and this value has to reach the API exactly as entered.

---

## Two lifecycle axes, as everywhere else

| | Meaning | Set from |
| --- | --- | --- |
| `isActive: false` | Still exists and every past sale of it stays true, but it is no longer offered at the till | The **Ketersediaan** switch on the edit form |
| `deletedAt` | The record should never have existed | The row's **Hapus** action |

Conflating them would force a shop to *delete* a discontinued service to stop it appearing
in the POS — taking its name off every historical receipt that sold it.

**Deleting is refused while a live bundle still lists the service** — `409` naming how
many, surfaced from the error's `reason`. The failure it prevents is quiet: an
`auto`-priced bundle whose component resolved to nothing would quote a total *missing that
component's share*, with no error anywhere.

---

## Business line is required, and it is not decoration

Every journal line a POS sale writes is tagged `businessLineId`, so the P&L can be split
per line. That split is the entire reason `4102 Penjualan Jasa` is one account rather than
three.

The options are **fetched**, unlike pet species which are a closed enum — a tenant names
its own lines, so a hardcoded list would show the wrong words for every tenant that did not
call theirs "Grooming". Capped at the API's 100-per-page limit, the same ceiling
`PetOwnerField` documents.

Unlike a pet's owner, `businessLineId` **is editable**: moving a service between lines
re-tags nothing historical, because journal lines carry the id they were posted with.

---

## `durationMin` is required — since 3 September 2026

**It was nullable for two phases, and that was the right call at the time.** The field
shipped before the booking module so that adding a duration afterwards would not mean
backfilling every service a tenant had already priced, from memory, one at a time. The bet
paid off: the module is here and the field has readers.

**Now three things read it, and all three GUESS without it** — the calendar draws a block,
the clash check works out when somebody is free again, and "selesai sekitar" adds up. The
guess is half an hour, the smallest slot the grid draws, and a guess on a calendar is read
as fact by everybody downstream.

**On update it may be GAINED and not lost.** A catalogue priced before the rule can still be
edited — that is how the remaining blanks get filled — but clearing it is refused. The
services table marks the ones still missing it as **"Belum diisi"** in red rather than as an
em dash: a dash reads as "not applicable", this reads as a job.

**The one case to watch:** a service that genuinely has no duration — a pickup, a phone
consultation — now needs a number anyway. If that bites, the rule should narrow to services
that can be booked rather than loosen for everything.

Capped at 1440 — a stay longer than a day is a hotel booking, one line per night, not one
service lasting a week. The error message says that rather than quoting the number.
