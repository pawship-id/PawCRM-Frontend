# Customer Quick-Add & Search

Two dialogs the POS reaches for, exported from `@/features/customers`. No route of their
own — they open over whatever screen needs to attach a customer to something.

Backend: `/api/customers` (unchanged surface, one new response annotation).
Fase 2 of the POS module.

---

## What they are for

FR-2: selecting a customer is **optional** for Kas/QRIS/Transfer/EDC and **required** for
Piutang. A walk-in taking credit has to be tied to a real identity before the sale can be
finished, and sending the cashier to the customer module would abandon a half-built cart.

| Component | Job |
| --- | --- |
| `CustomerSearchDialog` | Find an existing customer by name or phone, or fall through to creating one |
| `CustomerQuickAddDialog` | Two fields, saved and selected immediately |

**The quick-add lives inside the search dialog**, not beside it. The moment somebody
discovers a customer does not exist is the moment they need to create one; sending them to
another screen to come back and search again is the flow *"tanpa keluar dari layar kasir"*
rules out. The empty state is where the button lives, and **the typed term is carried into
the form** when it reads as a phone number — somebody who typed one has already entered
that field once.

---

## Search is server-side, and that is a departure

Every other picker in this codebase — `PetOwnerField`, the business-line pickers, the
account picker — loads a page of options and searches **inside** it. Past the page cap they
silently cannot find anyone.

A till cannot work that way. The shop with four hundred pelanggan is exactly the shop that
needs this dialog. So the term goes to the server: `?search=` already matches **name, email
and phone**, which was verified against the repository rather than taken on trust.

> This is the pattern the other pickers should migrate to. `PetOwnerField`'s own doc already
> names its 100-customer ceiling as a limit waiting for exactly this.

---

## Phone is required here and optional in the API

Deliberate, not a gap.

The API has to keep accepting a **name-only** customer — a clinic recording a walk-in before
it has any contact details is a real case the customer docs already describe, and narrowing
the contract for one caller would break it.

But the reason to quick-add **from the till** is almost always a piutang, and a debtor with
no phone number is a debt nobody can chase. The rule belongs to the dialog.

---

## A duplicate number is a warning, and it has to survive the client

The server returns the customer **and** a `warnings` array naming who else holds the
number. `apiClient.post` unwraps the envelope to `data` and would **throw the warning
away** — so `customerService.createWithWarnings` uses `apiClient.postEnvelope`, which
returns the whole envelope.

That method pair is new. `request` was split into an envelope-returning core and a thin
unwrapping wrapper: the error path always read the full envelope (that is where `details`
and `reason` come from), while the success path discarded everything but `data`, which made
a *successful-but-noteworthy* response impossible to express.

`onCreated` receives `(customer, warnings)`. `warnings` is always an array — empty when
there is nothing to say — so a caller renders zero, one or many with one code path. The POS
(Fase 6) is what will surface it beside the selected customer.

---

## Known limits

**The result list shows 8.** A till picks one customer; it does not browse. Typing more
characters is the way to narrow, not paging — which is why there is no pager in the dialog.

**Neither dialog is wired into a screen yet.** They are exported and tested, and the POS
cart panel is what mounts them in Fase 6. The customer module's own screens keep their
existing full form.
