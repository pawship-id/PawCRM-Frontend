"use client";

import { useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { CustomerStats } from "@/types/api";

/** One tile's number: how many there are, and whether we know yet. */
export interface RegistryCount {
  total: number;
  loading: boolean;
  error: boolean;
}

/** The customer-side figures: three tiles from one request. */
export interface CustomerStatsState {
  data: CustomerStats | null;
  loading: boolean;
  error: boolean;
}

export interface RegistryCounts {
  pets: RegistryCount;
  customers: CustomerStatsState;
}

const PENDING: RegistryCount = { total: 0, loading: true, error: false };
const FAILED: RegistryCount = { total: 0, loading: false, error: true };
/** Not asked for — the caller holds no grant, so its tile is never rendered. */
const UNGRANTED: RegistryCount = { total: 0, loading: false, error: false };

const STATS_PENDING: CustomerStatsState = {
  data: null,
  loading: true,
  error: false,
};
const STATS_FAILED: CustomerStatsState = {
  data: null,
  loading: false,
  error: true,
};
const STATS_UNGRANTED: CustomerStatsState = {
  data: null,
  loading: false,
  error: false,
};

/**
 * The four numbers over the Pelanggan module — how many animals, how many
 * owners, how many of those owners are new, and how many of them have bought
 * anything lately.
 *
 * THREE OF THE FOUR COME FROM ONE REQUEST. `GET /customers/stats` exists because
 * the list endpoint could answer only the first of them: it has no date filter,
 * so "Pelanggan baru bulan ini" and "Transaksi 90 hari terakhir" used to be
 * tiles wearing a "Segera" badge. They are real figures now, counted by the
 * server over windows it names in its answer — so the caption can never claim a
 * window the number was not measured over.
 *
 * THE ANIMAL COUNT IS STILL ITS OWN REQUEST, and deliberately not folded into
 * the stats endpoint: it belongs to the pet register, behind `pets:read`. A
 * combined response would put two modules' totals behind one permission, and a
 * role that may read customers but not pets would be refused the whole row.
 *
 * ONE ROW IS FETCHED FOR THE PETS, NOT THE LIST. `limit: 1` costs a single small
 * query and `pagination.total` still reports the true figure — the same trick
 * useLowStockAlert plays for the landing page.
 *
 * NOT TAKEN FROM THE LIST ALREADY ON SCREEN, which is the obvious shortcut and
 * is wrong: that list is filtered. Somebody who types "budi" in the search box
 * would watch "Jumlah pelanggan" fall to 3, which is not what the tile claims to
 * count. These ask unfiltered, once, and do not move while the reader narrows
 * the table under them.
 *
 * DELETED ROWS ARE OUT on both sides — `includeDeleted` defaults to false on the
 * pet list, and the stats endpoint counts only live customers.
 */
export function useRegistryCounts(
  mayReadCustomers: boolean,
  mayReadPets: boolean,
): RegistryCounts {
  const [customers, setCustomers] =
    useState<CustomerStatsState>(STATS_PENDING);
  const [pets, setPets] = useState<RegistryCount>(PENDING);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape (see useLowStockAlert): both tiles go
    // back to their pending state before the pair of requests that refill them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(mayReadCustomers ? STATS_PENDING : STATS_UNGRANTED);
    setPets(mayReadPets ? PENDING : UNGRANTED);

    if (mayReadCustomers) {
      customerService
        .stats()
        .then((data) => {
          if (active) setCustomers({ data, loading: false, error: false });
        })
        .catch(() => {
          if (active) setCustomers(STATS_FAILED);
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
