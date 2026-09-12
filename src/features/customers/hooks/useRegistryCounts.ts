"use client";

import { useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";

/** One tile's number: how many there are, and whether we know yet. */
export interface RegistryCount {
  total: number;
  loading: boolean;
  error: boolean;
}

export interface RegistryCounts {
  customers: RegistryCount;
  pets: RegistryCount;
}

const PENDING: RegistryCount = { total: 0, loading: true, error: false };
const FAILED: RegistryCount = { total: 0, loading: false, error: true };
/** Not asked for — the caller holds no grant, so its tile is never rendered. */
const UNGRANTED: RegistryCount = { total: 0, loading: false, error: false };

/**
 * The two headline numbers on the Pelanggan screen: how many owners are on the
 * books, and how many animals.
 *
 * ONE ROW IS FETCHED, NOT THE LIST. `limit: 1` costs a single small query and
 * `pagination.total` still reports the true figure — the same trick
 * useLowStockAlert plays for the landing page.
 *
 * NOT TAKEN FROM THE LIST ALREADY ON SCREEN, which is the obvious shortcut and
 * is wrong: that list is filtered. Somebody who types "budi" in the search box
 * would watch "Pelanggan terdaftar" fall to 3, which is not what the tile
 * claims to count. This asks unfiltered, once, and does not move while the
 * reader narrows the table under it.
 *
 * DELETED ROWS ARE OUT, because `includeDeleted` defaults to false on both
 * endpoints. "Terdaftar" means the ones still on the books.
 *
 * Each side is gated by its own grant: a role that may read customers but not
 * pets gets one tile, not a 403 painted across the header.
 */
export function useRegistryCounts(
  mayReadCustomers: boolean,
  mayReadPets: boolean,
): RegistryCounts {
  const [customers, setCustomers] = useState<RegistryCount>(PENDING);
  const [pets, setPets] = useState<RegistryCount>(PENDING);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape (see useLowStockAlert): both tiles go
    // back to their pending state before the pair of requests that refill them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(mayReadCustomers ? PENDING : UNGRANTED);
    setPets(mayReadPets ? PENDING : UNGRANTED);

    if (mayReadCustomers) {
      customerService
        .list({ page: 1, limit: 1 })
        .then((result) => {
          if (active)
            setCustomers({
              total: result.pagination.total,
              loading: false,
              error: false,
            });
        })
        .catch(() => {
          if (active) setCustomers(FAILED);
        });
    }

    if (mayReadPets) {
      petService
        .list({ page: 1, limit: 1 })
        .then((result) => {
          if (active)
            setPets({
              total: result.pagination.total,
              loading: false,
              error: false,
            });
        })
        .catch(() => {
          if (active) setPets(FAILED);
        });
    }

    return () => {
      active = false;
    };
  }, [mayReadCustomers, mayReadPets]);

  return { customers, pets };
}
