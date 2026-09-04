import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosOtherChargesEditor } from "@/features/pos/components/PosOtherChargesEditor";

/**
 * Biaya lain, at the till (FR-5).
 *
 * WHAT THESE PIN. The row is two boxes and a plus, and every rule it enforces is
 * invisible in the markup:
 *
 *  1. it SAYS WHAT IT IS above the fields. A placeholder cannot do that job — it
 *     vanishes the moment somebody types, and "Ongkos kirim" greyed out in an
 *     empty box reads as a value already entered rather than as an example;
 *  2. it is ALWAYS ADDITIVE and refuses a zero, which is FR-5's own edge case: a
 *     labelled charge of nothing is a receipt line that means nothing;
 *  3. the two fields keep their own accessible names, because the heading names
 *     the group and one `<label>` can only ever point at one control.
 */
const noop = () => {};

const nameField = () => screen.getByLabelText("Nama biaya");
const amountField = () => screen.getByLabelText("Nominal biaya");
const addButton = () => screen.getByRole("button", { name: "Tambah biaya" });

describe("what the row says it is", () => {
  it("carries a visible heading, not only placeholders", () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    expect(screen.getByText("Biaya lainnya")).toBeInTheDocument();
  });

  /*
    THE PLACEHOLDERS STAY. They are examples of what to type — "Ongkos kirim",
    "10000" — which is a different job from naming the field, and the heading
    above does not make them redundant.
  */
  it("keeps the examples in the boxes", () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    expect(nameField()).toHaveAttribute("placeholder", "Ongkos kirim");
    expect(amountField()).toHaveAttribute("placeholder", "10000");
  });

  /*
    THE HEADING NAMES THE GROUP, the aria-labels name the boxes. Pointing one
    `<label>` at the name field would rename it "Biaya lainnya" and leave the
    amount beside it named something narrower than its neighbour.
  */
  it("still names each box for a screen reader", () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    expect(nameField()).toBeInTheDocument();
    expect(amountField()).toBeInTheDocument();
  });
});

describe("adding one", () => {
  it("hands the charge up and clears the row", async () => {
    const onChange = jest.fn();
    render(<PosOtherChargesEditor charges={[]} onChange={onChange} />);

    await userEvent.type(nameField(), "Ongkos kirim");
    await userEvent.type(amountField(), "10000");
    await userEvent.click(addButton());

    expect(onChange).toHaveBeenCalledWith([
      { label: "Ongkos kirim", amount: "10000" },
    ]);
    expect(nameField()).toHaveValue("");
  });

  it("adds on Enter from the amount, the way a till is typed into", async () => {
    const onChange = jest.fn();
    render(<PosOtherChargesEditor charges={[]} onChange={onChange} />);

    await userEvent.type(nameField(), "Kartu ucapan");
    await userEvent.type(amountField(), "5000{Enter}");

    expect(onChange).toHaveBeenCalledWith([
      { label: "Kartu ucapan", amount: "5000" },
    ]);
  });

  /* FR-5's edge case: a labelled charge of nothing is a line that means nothing. */
  it("refuses a zero", async () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    await userEvent.type(nameField(), "Ongkos kirim");
    await userEvent.type(amountField(), "0");

    expect(addButton()).toBeDisabled();
  });

  /*
    A NEGATIVE CHARGE IS A DISCOUNT WEARING A LABEL, and it would skip every
    approval rule discounts have. The form cannot express one.
  */
  it("refuses anything that is not whole rupiah", async () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    await userEvent.type(nameField(), "Ongkos kirim");
    await userEvent.type(amountField(), "-5000");

    expect(addButton()).toBeDisabled();
  });

  it("refuses an amount with no label", async () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} />);

    await userEvent.type(amountField(), "10000");

    expect(addButton()).toBeDisabled();
  });
});

describe("what is already on the sale", () => {
  it("lists each charge with its money and a way to take it off", async () => {
    const onChange = jest.fn();
    render(
      <PosOtherChargesEditor
        charges={[{ label: "Ongkos kirim", amount: "10000" }]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Ongkos kirim")).toBeInTheDocument();
    expect(screen.getByText("Rp 10.000")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Hapus biaya Ongkos kirim" }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("goes quiet while a cart write is in flight", () => {
    render(<PosOtherChargesEditor charges={[]} onChange={noop} disabled />);

    expect(nameField()).toBeDisabled();
    expect(addButton()).toBeDisabled();
  });
});
