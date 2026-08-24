"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { Branch, Warehouse, WarehouseScopeEntry } from "@/types/api";

/**
 * Branch- AND warehouse-scope picker, enforcing the backend's rules client-side.
 *
 * The two axes are nested because they are nested in the data: a branch is a
 * set of books, a warehouse is a shelf inside it (warehouse.model.js), so
 * granting a branch opens the question of which of its shelves. A user has
 * EITHER every branch — and with it every warehouse — OR an explicit set of
 * branches, each of which is either "all its warehouses" or a non-empty pick.
 *
 * SHARED WAREHOUSES ARE NOT PICKABLE, deliberately. A warehouse belonging to no
 * branch serves all of them, so it comes with any branch access at all; showing
 * it as a checkbox would offer a choice that does not exist. It is named in a
 * note instead, so an administrator can see what the grant includes.
 *
 * Presentational: the parent form owns the three values and the lookups from
 * useLookups. The server remains the authority and re-validates everything.
 */
export function BranchScopeField({
  branches,
  warehouses,
  allBranches,
  branchAccess,
  warehouseAccess,
  onChange,
  error,
  warehouseError,
  disabled,
}: {
  branches: Branch[];
  warehouses: Warehouse[];
  allBranches: boolean;
  branchAccess: string[];
  warehouseAccess: WarehouseScopeEntry[];
  onChange: (next: {
    allBranches: boolean;
    branchAccess: string[];
    warehouseAccess: WarehouseScopeEntry[];
  }) => void;
  error?: string;
  /** Keyed by branch id — a branch narrowed to no warehouse at all. */
  warehouseError?: Record<string, string>;
  disabled?: boolean;
}) {
  // `defaultBranchId: null` is the central warehouse; everything else sits in
  // exactly one branch.
  const sharedWarehouses = warehouses.filter((w) => w.defaultBranchId === null);

  function warehousesOf(branchId: string) {
    return warehouses.filter((w) => w.defaultBranchId === branchId);
  }

  function scopeOf(branchId: string): WarehouseScopeEntry {
    return (
      warehouseAccess.find((entry) => entry.branchId === branchId) ?? {
        branchId,
        allWarehouses: true,
        warehouseIds: [],
      }
    );
  }

  function replaceScope(branchId: string, next: WarehouseScopeEntry) {
    return warehouseAccess.some((entry) => entry.branchId === branchId)
      ? warehouseAccess.map((entry) =>
          entry.branchId === branchId ? next : entry,
        )
      : [...warehouseAccess, next];
  }

  function toggleBranch(branchId: string, checked: boolean) {
    const nextBranches = checked
      ? [...branchAccess, branchId]
      : branchAccess.filter((id) => id !== branchId);

    onChange({
      allBranches: false,
      branchAccess: nextBranches,
      // A newly ticked branch starts at "all its warehouses" — the same default
      // the backend applies to a branch sent without a row. An unticked one
      // loses its row rather than keeping it: a leftover list is a permission
      // trap the day the branch is granted back.
      warehouseAccess: checked
        ? replaceScope(branchId, {
            branchId,
            allWarehouses: true,
            warehouseIds: [],
          })
        : warehouseAccess.filter((entry) => entry.branchId !== branchId),
    });
  }

  function setWarehouseMode(branchId: string, all: boolean) {
    onChange({
      allBranches: false,
      branchAccess,
      // Switching back to "all" clears the picked ids, so there is one
      // representation of all and no stale list waiting to take effect.
      warehouseAccess: replaceScope(branchId, {
        branchId,
        allWarehouses: all,
        warehouseIds: all ? [] : scopeOf(branchId).warehouseIds,
      }),
    });
  }

  function toggleWarehouse(
    branchId: string,
    warehouseId: string,
    checked: boolean,
  ) {
    const current = scopeOf(branchId);
    const nextIds = checked
      ? [...current.warehouseIds, warehouseId]
      : current.warehouseIds.filter((id) => id !== warehouseId);

    onChange({
      allBranches: false,
      branchAccess,
      warehouseAccess: replaceScope(branchId, {
        branchId,
        allWarehouses: false,
        warehouseIds: nextIds,
      }),
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Label>
        Akses cabang <span className="text-danger">*</span>
      </Label>

      <RadioGroup
        value={allBranches ? "all" : "specific"}
        disabled={disabled}
        onValueChange={(value) =>
          value === "all"
            ? // Every branch implies every warehouse, so the rows go with it.
              onChange({
                allBranches: true,
                branchAccess: [],
                warehouseAccess: [],
              })
            : onChange({ allBranches: false, branchAccess, warehouseAccess })
        }
        className="gap-2.5"
      >
        <div className="flex items-center gap-2.5">
          <RadioGroupItem value="all" id="branch-all" />
          <Label htmlFor="branch-all" className="font-normal">
            Semua cabang
            <span className="ml-1.5 text-xs text-muted">
              (termasuk semua gudang)
            </span>
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <RadioGroupItem value="specific" id="branch-specific" />
          <Label htmlFor="branch-specific" className="font-normal">
            Cabang tertentu
          </Label>
        </div>
      </RadioGroup>

      {!allBranches && (
        <div className="ml-6 flex flex-col gap-2.5 rounded-lg border border-border bg-background/50 p-3">
          {branches.length === 0 ? (
            <p className="text-xs text-muted">Belum ada cabang.</p>
          ) : (
            branches.map((branch) => {
              const checkboxId = `branch-${branch._id}`;
              const granted = branchAccess.includes(branch._id);
              const scope = scopeOf(branch._id);
              const branchWarehouses = warehousesOf(branch._id);

              return (
                <div key={branch._id} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id={checkboxId}
                      checked={granted}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        toggleBranch(branch._id, checked === true)
                      }
                    />
                    <Label htmlFor={checkboxId} className="font-normal">
                      {branch.name}
                    </Label>
                  </div>

                  {/* The warehouse question only exists once the branch is
                      granted — there are no shelves to choose in books the user
                      cannot reach. */}
                  {granted && (
                    <div className="ml-6 flex flex-col gap-2">
                      {branchWarehouses.length === 0 ? (
                        <p className="text-xs text-muted">
                          Belum ada gudang di cabang ini.
                        </p>
                      ) : (
                        <>
                          <RadioGroup
                            value={scope.allWarehouses ? "all" : "specific"}
                            disabled={disabled}
                            onValueChange={(value) =>
                              setWarehouseMode(branch._id, value === "all")
                            }
                            className="gap-2"
                          >
                            <div className="flex items-center gap-2.5">
                              <RadioGroupItem
                                value="all"
                                id={`wh-all-${branch._id}`}
                              />
                              <Label
                                htmlFor={`wh-all-${branch._id}`}
                                className="text-xs font-normal"
                              >
                                Semua gudang di cabang ini
                              </Label>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <RadioGroupItem
                                value="specific"
                                id={`wh-specific-${branch._id}`}
                              />
                              <Label
                                htmlFor={`wh-specific-${branch._id}`}
                                className="text-xs font-normal"
                              >
                                Gudang tertentu
                              </Label>
                            </div>
                          </RadioGroup>

                          {!scope.allWarehouses && (
                            <div className="ml-6 flex flex-col gap-2">
                              {branchWarehouses.map((warehouse) => {
                                const id = `wh-${warehouse._id}`;
                                return (
                                  <div
                                    key={warehouse._id}
                                    className="flex items-center gap-2.5"
                                  >
                                    <Checkbox
                                      id={id}
                                      checked={scope.warehouseIds.includes(
                                        warehouse._id,
                                      )}
                                      disabled={disabled}
                                      onCheckedChange={(checked) =>
                                        toggleWarehouse(
                                          branch._id,
                                          warehouse._id,
                                          checked === true,
                                        )
                                      }
                                    />
                                    <Label
                                      htmlFor={id}
                                      className="text-xs font-normal"
                                    >
                                      {warehouse.name}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {warehouseError?.[branch._id] && (
                            <p role="alert" className="text-xs text-danger">
                              {warehouseError[branch._id]}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Named rather than offered as checkboxes: this grant is automatic,
              and a tickbox would imply a choice the backend does not accept. */}
          {sharedWarehouses.length > 0 && (
            <p className="text-xs text-muted">
              Gudang bersama selalu ikut terakses:{" "}
              {sharedWarehouses.map((w) => w.name).join(", ")}.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
