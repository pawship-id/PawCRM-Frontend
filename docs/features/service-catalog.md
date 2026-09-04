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
`199999.99` before any of our code runs. That holds for a **variant's** price exactly as it
does for a flat one.

`inputMode="numeric"` rather than `type="number"`: a number input in some browsers silently
reformats what was typed, and this value has to reach the API exactly as entered.

---

## Flat price, or one per variant — never both

The **Harga beda per varian** switch decides which half of the pricing card exists, and the
payload carries only that half: `price` alone, or `variantAxes` + `variants` alone. Sending
both is a `400`, and so is sending neither — the rule is the server's
(`ServiceService.#prepareVariantConfig`), checked here first so the answer arrives without a
round trip.

**The axes are a closed list of three** — Tipe hewan, Kategori ukuran, Kategori bulu — and
their values are the **pet's own**: `cat`/`dog`, `small`/`medium`/`large`, `long hair`/`short
hair`, mirroring `PET_SPECIES`, `PET_SIZES` and `PET_FUR_TYPES`. A product's variant axes are
free text because a product can vary by anything a merchant sells in different flavours; a
service varies by what is standing on the table.

**The rows are GENERATED from the ticked axes, never typed in.** That is what puts three of
the server's rules out of reach of this screen: no duplicate combination, no variant missing
a declared axis, and no variant setting one the service never declared. Ticking a second
axis keeps the prices already typed for the combinations that survive — somebody refining an
answer is not starting again. The widest grid is 2 × 3 × 2, twelve rows, well under the
API's cap of 20.

**In the list, a variant-priced service shows its range** (`Rp 120.000 – Rp 180.000`) with
*per varian* beneath it, not an em dash. Its `price` field really is `null`, but a dash in a
price column reads as "not priced yet", which is the one thing that row is not. The low and
high are picked by comparing integer minor units, never Numbers.

---

## Main services and add-ons are one collection

**Jenis layanan** is `main` or `addon`. An add-on prices, sells and posts exactly like a main
service — the only difference is which list it appears on, and that only a main service may
carry `addonServiceIds`.

The picker lists **only services already filed as add-on**, because those are the only ids
the API accepts there; offering a main service and letting the save fail would be a list that
lies. The service being edited is never offered as one of its own add-ons. Filing a service
as `addon` **hides** the card rather than disabling it — the server empties the list anyway,
and a disabled card offers a choice that has no effect.

**Deleting is refused while another service still lists it as an add-on**, the same `409`
shape the bundle guard uses.

---

## Availability: locations, pickup, branches

| Field | Control | Note |
| --- | --- | --- |
| `serviceLocations` | Two check-rows | **Both may be ticked** — a mobile groomer that also works in the shop. At least one is required |
| `pickupDeliveryAvailable` | Switch | Whether the pet may be collected and dropped home |
| `allBranches` / `branchIds` | Checkbox plus a list | "Semua cabang" keeps meaning every branch as new ones open, so it is a control of its own rather than "tick everything" |

**Ticking "Semua cabang" drops the list**, matching what the server stores: a leftover list
is a trap the day the box is unticked, because the service would silently reappear in exactly
the branches somebody picked months ago. A scope of **no** branches is refused on both sides —
a service available nowhere vanishes from every till while looking perfectly healthy on its
own page.

The branch and add-on reads **fail softly**: `branches:read` and the add-on list are separate
grants from the one that opened the form, and neither failure blocks a save. The schema's own
defaults — every branch, no add-ons — are the safe answers when a list cannot be seen, and
each failure is reported beside its own field.

---

## Sesi and Termasuk are lists, not paragraphs

Both are add-and-remove chip fields, not comma-separated boxes: each line is rendered as a
separate item downstream (a calendar's stops, a storefront's ticks), so a separator inside
the data would turn the first item containing a comma into two.

**Termasuk is deliberately not Keterangan.** The description is prose about the service; this
is the itemised list a storefront renders as ticks under it. Conflating them would force a
tenant to choose between a readable paragraph and a scannable list.

---

## `code` is required

It is what staff quote to each other and how a service is found in a hurry, so it is expected
from the day the service is priced rather than added later — the same rule `products.sku`
already keeps. Unique per tenant; a duplicate comes back as a `409` bound to the code field
rather than to a banner.

---

## The picture

`ImageField` — **promoted out of the categories feature** when this one needed it, per
ui-rules §14, rather than copy-pasted. What changes per caller is the label, the storage
`purpose` and the alt text; the crop, the upload and the failure paths are identical. Services
upload under `purpose: "service"`, which is a segment of the storage key that the backend's
orphan sweeper reads — `sweepOrphanMedia.js` asks `services` about the key before deleting
anything, so a service's picture is never swept out from under it.

---

## Two lifecycle axes, as everywhere else

| | Meaning | Set from |
| --- | --- | --- |
| `isActive: false` | Still exists and every past sale of it stays true, but it is no longer offered at the till | The **Ketersediaan** switch on the edit form |
| `deletedAt` | The record should never have existed | The row's **Hapus** action |

Conflating them would force a shop to *delete* a discontinued service to stop it appearing
in the POS — taking its name off every historical receipt that sold it.

**Deleting is refused while a live bundle still lists the service, or another service still
lists it as an add-on** — `409` naming how many either way, surfaced from the error's
`reason`. The failure it prevents is quiet: an `auto`-priced bundle whose component resolved
to nothing would quote a total *missing that component's share*, and a main service whose
add-on vanished would offer a tick that silently adds nothing to the sale.

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
