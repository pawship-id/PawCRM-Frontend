"use client";

import { useEffect, useState } from "react";

import type { FilterOption } from "@/components";
import { customerService } from "@/services/customer.service";
import { supplierService } from "@/services/supplier.service";
import { userService } from "@/services/user.service";
import type { CashTransactionPartyType } from "@/types/api";

/**
 * WHO THE MONEY CAME FROM OR WENT TO — the three registers a shop already keeps,
 * as one picker.
 *
 * `partyType` on the transaction is exactly `customer | supplier | user`, so the
 * groups are not a presentation choice: they are the three things the field can
 * be, and picking from one of them is what lets the transaction carry a real id
 * rather than a name somebody typed twice with different spelling.
 *
 * THE VALUE IS `type:id`, not the bare id. Two registers can hand back the same
 * ObjectId only by accident, but a picker whose value does not say which list a
 * row came from would have to search all three again to find out — and the form
 * has to send the type anyway.
 *
 * EACH LIST FAILS ON ITS OWN. Reading customers, suppliers and users are three
 * separate grants, and a cashier who may see suppliers and not staff should get
 * the suppliers rather than an empty picker. A group nobody may read is simply
 * not there, which is also what an empty register looks like — and both mean the
 * same thing to somebody filling in the form.
 */
export interface ContactOption {
  type: CashTransactionPartyType;
  id: string;
  name: string;
}

/** The sentinel for "somebody who is in none of the three registers". */
export const OTHER_PARTY = "__other__";

export const PARTY_TYPE_LABEL: Record<CashTransactionPartyType, string> = {
  customer: "Pelanggan",
  supplier: "Supplier",
  user: "Staf",
};

export function contactKey(type: CashTransactionPartyType, id: string): string {
  return `${type}:${id}`;
}

export function parseContactKey(
  key: string,
): { type: CashTransactionPartyType; id: string } | null {
  const [type, id] = key.split(":");
  if (!id) return null;
  if (type !== "customer" && type !== "supplier" && type !== "user") return null;
  return { type, id };
}

export interface UseContactOptionsResult {
  contacts: ContactOption[];
  /** Grouped and ready for `FilterSelect` — Pelanggan, Supplier, Staf. */
  options: FilterOption<string>[];
  loading: boolean;
}

/** The cap the pickers elsewhere use. A shop has tens of each, not thousands. */
const LIMIT = 100;

export function useContactOptions(enabled = true): UseContactOptionsResult {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const empty = <T,>(): T[] => [];

    void Promise.all([
      customerService
        .list({ limit: LIMIT })
        .then((page) =>
          page.items.map(
            (row): ContactOption => ({
              type: "customer",
              id: row._id,
              name: row.name,
            }),
          ),
        )
        .catch(empty<ContactOption>),
      supplierService
        .list({ limit: LIMIT, isActive: true })
        .then((page) =>
          page.items.map(
            (row): ContactOption => ({
              type: "supplier",
              id: row._id,
              name: row.name,
            }),
          ),
        )
        .catch(empty<ContactOption>),
      // Suspended staff are left out: they are not being paid this month, and a
      // picker is a list of what to choose, not an archive.
      userService
        .list({ limit: LIMIT, status: "active" })
        .then((page) =>
          page.items.map(
            (row): ContactOption => ({
              type: "user",
              id: row._id,
              name: row.fullName,
            }),
          ),
        )
        .catch(empty<ContactOption>),
    ])
      .then(([customers, suppliers, users]) => {
        if (active) setContacts([...customers, ...suppliers, ...users]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  /*
    IN THE ORDER THE GROUPS ARE BUILT ABOVE — pelanggan, supplier, staf — because
    `FilterSelect` draws a heading wherever the group changes and does not sort
    behind the caller's back.
  */
  const options: FilterOption<string>[] = contacts.map((contact) => ({
    value: contactKey(contact.type, contact.id),
    label: contact.name,
    group: PARTY_TYPE_LABEL[contact.type],
  }));

  return { contacts, options, loading };
}
