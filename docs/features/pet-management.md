# Pet Management

Master Data → **Hewan**. The register of animals a tenant's customers bring in.

Backend: `PawCRM-Backend/src/models/pet.model.js` and the `/api/pets` routes.
Fase 1 of the POS module — the prerequisite the Booking Bridge (FR-3) cannot be built
without.

---

## Screens

| Route | Component | Permission |
| --- | --- | --- |
| `/dashboard/master/pets` | `PetsScreen` | `pets:read` |
| `/dashboard/master/pets/new` | `PetForm` | `pets:create` |
| `/dashboard/master/pets/[id]` | `PetForm` (with `petId`) | `pets:update` |

`PetQuickAddDialog` has no route of its own. It is exported for **other** features: the
POS Booking Bridge registers an animal mid-sale without leaving the till, and a redirect
to the full form would abandon a half-built cart.

`CustomerPetsSection` has no route either — it is the **Hewan** card on the customer edit
screen (`/dashboard/master/customers/[id]`).

### Why the customer's pet list lives in THIS feature

It reads pet data, calls pet services and gates on the `pets` permission. Putting it under
`features/customers` would mean that feature importing a hook, a service and two badges
from this one — the dependency pointed the wrong way. The customers feature imports one
component from this feature's public surface instead.

It is a **list, not a table**: the register at Master Data → Hewan is the table, and here
the question is only *who lives with this person*. Six columns of grooming detail would
push the customer's own fields off the screen.

**Retired pets are shown there**, and that is not an oversight. `isActive: false` still
belongs to this owner and its history is still filed under them — hiding it would make the
card disagree with the delete guard, which counts retired pets and refuses to remove the
customer. The card sits directly above the danger zone for the same reason: reading the
refusal after seeing the animals is what makes it make sense.

A customer with more than one page of animals gets a plain count of what is not shown,
**not** a "lihat semua" link — the register screen does not read a customer filter from
the URL yet, and a link that quietly showed every animal in the shop would be worse than
none.

---

## The two lifecycle axes

This is the thing to understand before changing anything here. A pet has **two**
independent states where a customer has one.

| | Meaning | Set from |
| --- | --- | --- |
| `isActive: false` | The animal is no longer in the tenant's care — it passed away, or was rehomed. Its history stays true and readable | The **Status perawatan** switch on the edit form |
| `deletedAt` | The record should never have existed: a duplicate, a test row, a typo saved twice | The row's **Hapus** action |

One flag could not say both. Conflating them would force a shop to *delete* a pet that
died in order to stop it appearing in a booking dropdown — taking its grooming history
with it. The delete confirmation says so, and points at the switch instead.

`PetStatusBadge` renders three states from these two booleans, deleted winning over
retired: a record that should not exist is more urgent than one merely out of care.

---

## The owner is set once

`customerId` is required on create and **absent from the API's PATCH schema**.
Reassigning an animal to another owner would silently move its bookings, invoices and
grooming history under a different name.

The UI does not offer what the API would drop: `PetOwnerField` renders disabled when
editing, with a note saying what to do instead — register the pet again under the new
owner and retire the old record.

**Deleting a customer with live pets is refused** — the API returns `409` naming how
many. Restoring a pet whose owner has since been deleted is refused the same way.

That `409`'s `message` is only the headline ("Cannot delete customer"); the half that says
what to do is in `reason`. Both places a customer can be deleted — the list row and the
edit screen's danger zone — read `reason ?? message`, because showing the headline alone
leaves somebody staring at a button that will not work with nothing on screen explaining
why. `CustomerDeleteGuard.test.tsx` holds that.

---

## Known limits, stated rather than discovered

**The owner picker loads 100 customers and searches in the popover.** 100 is the API's
own page cap, not a number chosen here: `pagination` in the backend's
`common.validation.js` refuses `limit` above it, and refuses rather than clamps.

`FilterSelect` searches over the options it was handed, so a tenant past that ceiling has
a picker that silently cannot find the rest. The field detects the truncation and says so
in its hint. Wiring the popover's search back to `?search=` is the fix, and it belongs
with the POS customer picker in Fase 2, which needs the same thing — 100 makes that more
pressing than 200 would have.

> **This field shipped asking for 200 and came back empty**, with the server's English
> "Validation failed" underneath it. That is the second time this codebase has made the
> exact mistake — see the `chartOfAccounts.service.ts` / `businessLine.service.ts` entry
> in the changelog, where "the first version asked for 200, which is a `400` rather than a
> bigger page". `PetForm.test.tsx` now asserts `limit <= 100` so a third time has to get
> past a test.

**The picker never shows the server's error text.** The API answers in English, and
"Validation failed" under a dropdown tells a shop owner nothing they can act on — it is
written for whoever reads the logs. ui-rules §12.

**There is no photo field on the form.** The API accepts one and the model stores one —
`pets.photo`, claimed from the media sweeper — but the upload control lives inside the
categories feature (`CategoryImageField`) and lifting it into the shared component layer
is a refactor of its own. It goes in when that move happens.

**`PetBadges` is feature-local, not the shared `StatusBadge`** ui-rules §9 calls for.
That component is specified and not yet built; building it belongs to whoever migrates
the fifteen existing feature-local badges. The file is deliberately small so it folds
into that migration cleanly.

---

## Age is derived, never stored

`PetsTable.ageInYears` computes whole years from `birthDate` at render time. An age
written into a record is wrong the day after it is written.

Whole years only: a month-precise age reads as clinical precision this screen does not
have, since a birth date is very often the owner's best guess.

The **not-in-the-future** rule is enforced in the Joi layer on the backend and again in
the form — the second copy exists because the server's message is in English and the
form's can point at the box.
