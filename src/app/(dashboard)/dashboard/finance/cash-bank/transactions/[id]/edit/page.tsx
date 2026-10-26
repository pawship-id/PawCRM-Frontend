"use client";

import { use, useCallback, useState } from "react";

import { CashTransactionEditScreen } from "@/features/cash-transactions";
import { FixedCostEditScreen } from "@/features/fixed-costs";

/**
 * UBAH — one edit URL for BOTH documents Kas & Bank keeps (21 September 2026,
 * on request): a cash transaction and a fixed cost.
 *
 * WHY IT HAS TO TRY RATHER THAN KNOW. The two live in different collections and
 * their ids are both opaque 24-hex strings, so nothing in the URL says which one
 * `:id` belongs to. The transaction is tried first because editing one is by far
 * the common case, and its own fetch IS the probe — that path costs nothing
 * extra. Only a fixed cost pays a second request, and the first was going to be
 * made anyway.
 *
 * NO `RequirePermission` HERE, deliberately. Which grant applies is not known
 * until one of the two fetches answers — `cashTransactions:update` for one,
 * `fixedCosts:update` for the other — and gating the route on either would lock
 * out somebody who holds only the other. Each screen checks its own.
 *
 * A CLIENT PAGE, because that choice is made from a response. `params` is a
 * Promise in this version of Next — see AGENTS.md.
 */
export default function EditCashBankDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [isFixedCost, setIsFixedCost] = useState(false);

  // Stable, so the effect that calls it does not fire on every render.
  const fallBack = useCallback(() => setIsFixedCost(true), []);

  if (isFixedCost) return <FixedCostEditScreen id={id} />;

  return (
    <CashTransactionEditScreen transactionId={id} onNotFound={fallBack} />
  );
}
