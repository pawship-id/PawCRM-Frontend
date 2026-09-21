# Payment Channels

Pengaturan → **Channel Pembayaran**. The named places money can arrive when a cashier takes
payment, each mapped to the account it debits.

Backend: `PawCRM-Backend/src/models/paymentChannel.model.js` and `/api/payment-channels`.
Fase 5 of the POS module — the last prerequisite before POS core.

---

## Screens

| Route | Component | Permission |
| --- | --- | --- |
| `/dashboard/pengaturan/channel-pembayaran` | `PaymentChannelsScreen` | `paymentChannels:read` |
| `/dashboard/pengaturan/channel-pembayaran/new` | `PaymentChannelForm` | `paymentChannels:create` |
| `/dashboard/pengaturan/channel-pembayaran/[id]` | `PaymentChannelForm` | `paymentChannels:update` |

**In Pengaturan, straight after Daftar Akun.** What is being edited is a mapping to the
chart of accounts — the row's whole purpose is the account it debits, and the person who
knows which account is right is the one who reads the ledger. You cannot map a channel
before the accounts exist, which is why it sits directly below them.

A channel is configured once and then referred to — by the POS payment panel, by the
supplier payment picker — which is what every other row in this nav group is.

### It lived under Keuangan → Kas & Bank between 16 and 20 September 2026

For those four days this screen *was* Kas & Bank: the table carried Masuk, Keluar and Saldo
columns beside each channel. **It reverted on request**, and the columns did not come with
it, because a saldo per channel could never be summed — several channels can point at one
account, so the balance had to be printed on one row and cross-referenced on the rest.

Kas & Bank kept the question it is named for and answers it **per ledger account** now
(`features/accounting/KasBankScreen`, `CashBankAccountsTable`), where a column of balances
adds up. The two screens no longer overlap: one is the register of buttons a cashier sees,
the other is where the money is.

Both old addresses `redirect`, and `/keuangan/kas-bank/[id]` carries the id across — a
bookmark to one channel should land on that channel's form, not on a list of six.

---

## Why a cashier picks a channel, not a type

The POS payment panel shows four tabs and a list under each. The tab is only how they are
grouped: a sale posts `Dr <account>`, and "transfer" is not an account. A tenant with three
bank accounts has three channels under one tab.

`CHANNEL_TYPE_LABELS` and `CHANNEL_TYPE_ORDER` are exported from this feature's public
surface **because the POS panel (Fase 7) renders the same four tabs, in the same order,
with the same words**. Two copies of that list is how the settings screen and the till start
disagreeing about what "EDC" is called.

---

## The MDR field does not exist where no fee is deducted

Cash arrives whole. A bank transfer's fee is paid by the **sender** and never touches what
the tenant receives. Only QRIS and EDC settle net of MDR.

So the field is **hidden** for cash and transfer rather than shown and refused. A rate there
is not a mistake a user should be allowed to make and then be told about — it is a field
with no meaning. The server refuses it too; this is the half that stops it being typed.

**Switching to a type with no fee clears a typed rate.** The field disappears, and a value
left behind in state would be sent on the next save — a `400` for something the user can no
longer see, which is the worst kind of refusal to receive. `PaymentChannelForm.test.tsx`
holds this.

---

## The server's four rules land on their fields

None of them is expressible in a schema: each is about a relationship between fields or
against stored state, and on an update a Mongoose path validator sees the query rather than
the document.

| Rule | Field the error binds to |
| --- | --- |
| The account must be a live **asset** | `accountId` — *"Akun ini tidak bisa dipakai — harus akun aset yang masih aktif."* |
| Only QRIS and EDC may carry `mdrPercent` | `mdrPercent` |
| A cash channel needs a branch under per-branch scope | `branchId` — *"Tenant ini menghitung kas per cabang…"* |
| `name` is unique **within its type** | `name`, naming the tab: *"Sudah ada channel Tunai bernama …"* |

The form does **not** know whether the tenant counts cash per branch — that is
`tenants.settings.posCashScope`, and reading it here to pre-validate would be a second
place for the rule to live. It states what happens in the field's hint, and binds the
server's refusal to the field when it comes.

**The account picker only offers live assets**, because the server refuses anything else —
offering the rest would be offering a guaranteed `400`.

---

## Deleting has no usage guard, unlike Services

FR-7 requires a removed channel's historical transactions to stay readable. A soft delete
gives that for free: the row is never removed, so a POS transaction from last March still
resolves its channel and still prints "Transfer — BCA" on a reprinted receipt.

What deletion does is take the channel out of the choices for **new** transactions. The
confirmation says exactly that, and points at `isActive` for the "stop using it for now"
case.

---

## Known limits

**The list and both pickers cap at 100**, the API's own page limit — asking for more is a
`400`, not a bigger page. For a settings screen this is not a real ceiling: a tenant has a
handful of channels, two or three bank accounts and a couple of drawers. A tenant past it
is one whose channel setup needs a conversation, not a second page.

**Account and branch labels are fetched once by `usePaymentChannelList`** and handed to the
table as maps. A lookup per row would be six requests for six channels, and the table would have to
own loading states for data it does not otherwise care about. A missing label renders as a
dash rather than an error — the list is perfectly readable without it.
