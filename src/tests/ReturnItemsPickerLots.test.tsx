import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  ReturnItemsPicker,
  type ReturnDraftLine,
} from "@/features/pos/components/ReturnItemsPicker";
import type { PosItem } from "@/types/api";

const item = {
  kind: "product",
  refId: "p1",
  name: "Me-O Creamy",
  qty: "3.0000",
  unitPrice: "22900.0000",
} as PosItem;

const LOTS = [
  { batchId: "a", batchCode: "MCTC:05/03/28", qty: "2.0000" },
  { batchId: "b", batchCode: "MCTC:18/04/28", qty: "1.0000" },
];

function Harness({ initial }: { initial: ReturnDraftLine }) {
  const [draft, setDraft] = useState<Record<number, ReturnDraftLine>>({
    0: initial,
  });

  return (
    <>
      <ReturnItemsPicker
        items={[item]}
        remaining={[3]}
        lotsByItem={[LOTS]}
        draft={draft}
        onChange={(index, line) => setDraft((d) => ({ ...d, [index]: line }))}
      />
      <output data-testid="lots">{JSON.stringify(draft[0].lots ?? [])}</output>
    </>
  );
}

describe("ReturnItemsPicker — choosing the lot the goods go back to", () => {
  it("offers nothing until something is coming back", () => {
    render(<Harness initial={{ qty: 0, returnToStock: true }} />);

    expect(screen.queryByRole("button", { name: "Tambah batch" })).toBeNull();
  });

  it("starts the first row from the automatic split, in the sale's order", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ qty: 3, returnToStock: true }} />);

    await user.click(screen.getByRole("button", { name: "Tambah batch" }));

    expect(screen.getByTestId("lots")).toHaveTextContent(
      JSON.stringify([
        { batchId: "a", qty: 2 },
        { batchId: "b", qty: 1 },
      ]),
    );
    // Covered: nothing left to add.
    expect(screen.queryByRole("button", { name: "Tambah batch" })).toBeNull();
  });

  it("offers no lots for goods that are not going back on the shelf", () => {
    render(<Harness initial={{ qty: 1, returnToStock: false }} />);

    expect(screen.queryByRole("button", { name: "Tambah batch" })).toBeNull();
  });
});
