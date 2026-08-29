"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import type { Branch, Customer } from "@/types/api";

/** One page each; a tenant has tens of branches, not thousands. */
const BRANCH_LIMIT = 100;

/**
 * Customers are not tens. A shop with three years of walk-ins has thousands, and
 * the picker is a dropdown rather than a search-as-you-type — so this is
 * deliberately the FIRST page rather than "all of them", and the filter is a
 * convenience over the regulars rather than a directory.
 *
 * WHY THAT IS ACCEPTABLE HERE: the customers who appear on a receivables screen
 * are the ones a shop gives credit to, which is a short list by nature. Somebody
 * looking for a debtor outside it opens that customer's own page.
 */
const CUSTOMER_LIMIT = 100;

interface ReceivableFilterOptions {
  customers: Customer[];
  branches: Branch[];
}

/**
 * The two dropdowns the receivables list filters by.
 *
 * DELIBERATELY UNFILTERED — no `isActive`, no live-only. This feeds a READ, and
 * a customer removed last month still owes what they owed: a filter that cannot
 * name them is a filter that cannot find their debts. The same holds for a
 * branch that has since shut — its books still carry them. The same argument
 * `useReceiptFilterOptions` makes on the buying side.
 *
 * NO `loading` AND NO `error`. A filter whose options have not arrived yet shows
 * "Semua pelanggan", which is the correct answer for an unset filter anyway, and
 * a failure leaves the list unfiltered rather than blocking a screen whose own
 * data loaded fine. `customers:read` and `branches:read` are separate permissions
 * from `customerInvoices:read`, so a role may legitimately hold one and not the
 * others.
 */
export function useReceivableFilterOptions(): ReceivableFilterOptions {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    let active = true;

    customerService
      .list({ limit: CUSTOMER_LIMIT })
      .then((result) => {
        if (active) setCustomers(result.items);
      })
      .catch(() => undefined);

    branchService
      .list({ limit: BRANCH_LIMIT })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return { customers, branches };
}
