# Membership (Promosi V1)

A membership is a **package** (plan) sold once and a **card** that carries its allowances —
free items, discounts, special prices, perks — for a fixed term. The till, the faktur and the
booking form all spend those allowances; this module is where they are defined, watched and
corrected.

Backend contract: `PawCRM-Backend/docs/membership-v1.md`. **The server decides everything
here** — status, counters, prices, who may buy. The screens show its answers and forecast the
effect of a Kelola change; they never compute a price or a remaining quota of their own.

---

## Routes

Promosi is its own rail module (16 October 2026). Membership left Pelanggan; the old
`/dashboard/master/customers/membership/**` routes only redirect.

| Route | Screen |
| --- | --- |
| `/dashboard/promosi` | redirects to Ringkasan (or the first tab the role may see) |
| `/dashboard/promosi/ringkasan` | `PromosiSummaryScreen` |
| `/dashboard/promosi/membership` · `/membership/paket` | `MembershipPlansPanel` |
| `/dashboard/promosi/membership/paket/new` · `/:id/edit` | `MembershipPlanForm` |
| `/dashboard/promosi/membership/paket/:id` | `MembershipPlanDetail` |
| `/dashboard/promosi/membership/anggota` | `MembershipCardsPanel` |
| `/dashboard/promosi/membership/anggota/:id` | `MembershipCardDetail` |

The nav row is gated by the `membership` module switch (Buloo admin) plus any of
`membershipPlans:read`, `petMemberships:read`, `membershipReports:read`.

---

## Screens

**Ringkasan** — four tiles from `/pet-memberships/summary` (packages sold, benefit value,
renewals, active members), per cabang and periode; **Perlu tindakan** from `/attention`
(cards ending ≤ 14 days → "Tawarkan perpanjang"; week/month allowances about to lapse →
"Ingatkan", with "· n dipesan" when a booking holds part of the bucket); per-plan
performance from `/reports/membership`.

**Paket** — code, name, Melekat ke (hewan/pelanggan), Syarat pembeli, Durasi, Harga ("mulai
dari" range on a variant-priced plan), **Anggota aktif** (`activeMembers`, list reads only),
status, short benefit chips (two, then "+n"). The form builds benefits with options,
scope, quota per period/total and per-variant prices.

**Anggota** — the pill row is the lens: **Aktif** (`status=activeNotExpiring`, so a card
ending soon is not counted twice) · Segera berakhir · Jatah belum terpakai · Berakhir, plus
Ditunda / Belum lunas only when they have cards. Counts are `limit=1` reads of
`pagination.total`. Search is the server's: card number, plan name, customer name/phone,
pet name.

**Anggota detail** — hero, **Sisa jatah** (headline counter, "+n koreksi", booking holds),
**Riwayat pemakaian** (document number — linked when it is a faktur — the line's `itemName`,
benefit, value; a reversed row stays, struck through, as "dikembalikan"), **Riwayat
perubahan** (read-only change log with reason and note), and **Kelola keanggotaan**.

Profiles: the customer profile shows `CustomerMembershipSection` (customer-held card, one
block per pet, history); the pet profile shows `PetMembershipPanel`. "Terbitkan manual"
(`IssueMembershipDialog`) records a card without taking money — selling goes through the
till.

---

## Kelola actions

Every action asks for a **reason** (exact enum strings) and an optional note, shows a preview
before saving, and lands in Riwayat perubahan. A refusal the forecast missed is shown as the
server's own words in a toast; the dialog stays open.

| Action | What it does | Grant |
| --- | --- | --- |
| Ubah masa berlaku | move start (if unused) or end date | `manage` |
| Tunda sementara | freeze for N days (≤ 30 total), end moves back | `manage` |
| Koreksi jatah periode ini | ± the current bucket, e.g. compensation | `manage` |
| Pindah ke hewan lain | pet cards only, to another pet of the same customer | `manage` |
| Ubah tanggal pakai | per ledger row, moves a redemption to another day | `manage` |
| Batalkan membership | only while nothing has been used | `cancel` |

Rows the role or the card's state does not allow stay visible, disabled, with the reason.

---

## POS (kasir)

- **Selling a package**: a package tile opens `PosMembershipSaleDialog` — whose (an animal, or
  the customer for a customer-held plan), from when (Hari ini / Setelah yang aktif berakhir /
  Pilih tanggal), referral code if the plan asks. Eligibility and price per animal come from
  `/pet-memberships/eligibility`; a refused animal is listed, disabled, with the reason. One
  package per holder per basket.
- **Spending a benefit**: one compact select per cart line (`PosBenefitSelect`). The quote
  auto-applies its best pick; the cashier can choose another or "Tanpa member". Benefits that
  cover the line but cannot be used show as short muted chips with the reason.
- The cart summary and the receipt both print **Potongan membership**. `PosCustomerPerks`
  shows the customer's cards as chips; after payment `PosSaleEffects` lists the cards issued
  and the allowances spent.

## Booking

The booking card's **Benefit membership** is a radio list from the booking quote (§4.4) —
each row says what it is worth on the booking's date, unusable ones say why, plus "Tanpa
member". A saved choice **holds** the allowance until the booking is billed or cancelled;
another booking in the same period sees it as used (`reason: "reserved"`).

---

## Permissions

| Feature | Actions |
| --- | --- |
| `membershipPlans` | `create` `read` `update` `delete` `restore` |
| `petMemberships` | `create` `read` `update` `cancel` `redeem` `manage` |
| `membershipReports` | `read` (Ringkasan's per-plan table) |

`petMemberships:manage` is new with the Kelola actions; the seeded roles give it (and
`cancel`) to Owner and Manager only.

## Tests

`MembershipCardsPanel`, `MembershipCardDetail`, `MembershipPlansPanel`,
`MembershipPlanForm`, `PetMembershipPanel`, `PromosiSummaryScreen`, `BookingBenefitField`,
`PosMembershipSale`, `posMembershipCart`, `posSaleEffects`, `membershipKelola`,
`membershipLabels`, `membershipPlanDraft`, `bookingBenefitQuote`.
