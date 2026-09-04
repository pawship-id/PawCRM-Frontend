# Booking Bridge

The POS's route to charging for a service. FR-3 of the POS PRD, Fase 4 of the plan.

Backend: `PawCRM-Backend/src/models/booking.model.js` and `/api/bookings`.

---

## What was built, and what deliberately was not

| | |
| --- | --- |
| **Built** | `BookingBridgeDialog` — two tabs: pull today's confirmed bookings, or create one on the spot |
| **Built** | `useBookingBridge`, `BookingStatusBadge`, and the `bookingService` client |
| **Not built** | A calendar, a groomer roster, capacity, clash detection |

This is the minimum the POS needs to take money for a grooming; the Booking module proper
builds the rest **on top of** this collection rather than replacing it. The screen that reads
and moves the same bookings is [`booking-screen.md`](./booking-screen.md).

The dialog has no route — the POS cart panel mounts it in Fase 6.

---

## Both tabs, every time — and the default follows the data

FR-3 is explicit: *"Kedua tab tersedia setiap kali modal dibuka"*. A shop where half the
grooming is walked in would otherwise have to invent an appointment retrospectively before
it could take the money.

**Which tab opens is derived, not stored.** With nothing to pull, opening on an empty list
and asking somebody to notice a second tab is a worse first frame than opening on the tab
that can actually do something.

That derivation happens **during render**, from a `tab` state whose `null` means *"the
cashier has not chosen"*. An effect that flipped the tab when the fetch landed would be a
real bug, not just a lint complaint: on a slow connection it would move somebody who had
already tapped through — possibly mid-tick. `BookingBridgeDialog.test.tsx` pins that.

The pull tab's empty state is still reachable, by tapping back to it, and is what a cashier
sees when they check whether a booking exists and it does not.

---

## The dialog writes nothing on the pull path

`onPull` hands the ticked bookings back and the POS decides what to do with them.

Marking them `pulledToCartAt` belongs to **whatever creates the cart, inside the transaction
that writes it** (Fase 6). A dialog that marked them itself would leave bookings claimed by a
cart that was never built — invisible to the bridge for the rest of the day, for a sale that
never happened.

The ad-hoc tab is different and does write: creating the booking **is** the action.

---

## The ad-hoc tab creates a real booking

Not a loose cart line. FR-3 requires *"atribusi ke hewan & layanan tetap tercatat untuk
histori"*, and `origin: "pos_adhoc"` is what tells it apart from an appointment somebody
actually made — so *"how many of this month's groomings were walk-ins"* stays answerable.

Created **`confirmed`**, not `draft`: the customer is standing at the counter. The POS moves
it to `completed` when the payment lands (Fase 7).

**One pet at a time.** The PRD's flow allows several, and this builds it one animal per
confirmation: pick a pet, tick its services, confirm, open the tab again for the second dog.
A pet × service matrix submitted at once would have to create several bookings from one form
and decide what to do when the third fails after the first two were written. Repeating a
small atomic action is the honest shape.

**No price is sent.** The server reads it from the catalogue and snapshots it — a price a
client can set is a discount a client can grant, and the till has its own audited path for
that (FR-4).

---

## `apiClient` gained array query params

`GET /api/bookings?status=confirmed&status=in_progress` — a day sheet wants more than one
status, and the backend's Joi schema accepts either a string or an array.

The client could not send it. `buildUrl` stringified every value, so an array became
`status=confirmed%2Cin_progress` — one value, which every `.valid(...)` enum check rejects.
An array now becomes **repeated params**, which is what Express parses back into an array.

This looks like it works until the first filter that takes more than one value, which is why
`api-client.test.ts` pins both the repeated form and the empty-array case.

---

## Known limits

**The ad-hoc tab loads 100 pets and 100 services**, the API's page cap. For one customer's
animals that is not a ceiling anybody reaches; for a catalogue of services it is the same
limit the rest of the app lives with, and the same one server-side search will lift.

**There is no groomer picker.** The API accepts `groomerUserId` and proves it is a user of
the tenant, but the dialog always sends null — FR-3's *"Belum ditentukan"*. Who may groom is
a roster question, and the PRD lists groomer assignment as an open item.
