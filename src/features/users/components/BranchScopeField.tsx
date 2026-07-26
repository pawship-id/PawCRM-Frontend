"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { Branch } from "@/types/api";

/**
 * Branch-scope picker enforcing the backend's rule client-side: a user has
 * EITHER access to all branches OR an explicit (non-empty) set of specific
 * branches — never both. Built on the shadcn/ui RadioGroup (the two modes) and
 * Checkbox (the specific-branch set). Picking "All branches" clears the set;
 * the server remains the authority and re-validates.
 *
 * Presentational: the parent form owns `allBranches` + `branchAccess` and the
 * branch list (from useLookups).
 */
export function BranchScopeField({
  branches,
  allBranches,
  branchAccess,
  onChange,
  error,
  disabled,
}: {
  branches: Branch[];
  allBranches: boolean;
  branchAccess: string[];
  onChange: (next: { allBranches: boolean; branchAccess: string[] }) => void;
  error?: string;
  disabled?: boolean;
}) {
  function toggleBranch(branchId: string, checked: boolean) {
    const next = checked
      ? [...branchAccess, branchId]
      : branchAccess.filter((id) => id !== branchId);
    onChange({ allBranches: false, branchAccess: next });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Label>
        Branch access <span className="text-danger">*</span>
      </Label>

      <RadioGroup
        value={allBranches ? "all" : "specific"}
        disabled={disabled}
        onValueChange={(value) =>
          value === "all"
            ? onChange({ allBranches: true, branchAccess: [] })
            : onChange({ allBranches: false, branchAccess })
        }
        className="gap-2.5"
      >
        <div className="flex items-center gap-2.5">
          <RadioGroupItem value="all" id="branch-all" />
          <Label htmlFor="branch-all" className="font-normal">
            All branches
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <RadioGroupItem value="specific" id="branch-specific" />
          <Label htmlFor="branch-specific" className="font-normal">
            Specific branches
          </Label>
        </div>
      </RadioGroup>

      {!allBranches && (
        <div className="ml-6 flex flex-col gap-2.5 rounded-lg border border-border bg-background/50 p-3">
          {branches.length === 0 ? (
            <p className="text-xs text-muted">No branches available.</p>
          ) : (
            branches.map((branch) => {
              const checkboxId = `branch-${branch._id}`;
              return (
                <div key={branch._id} className="flex items-center gap-2.5">
                  <Checkbox
                    id={checkboxId}
                    checked={branchAccess.includes(branch._id)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      toggleBranch(branch._id, checked === true)
                    }
                  />
                  <Label htmlFor={checkboxId} className="font-normal">
                    {branch.name}
                  </Label>
                </div>
              );
            })
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
