/**
 * The filter layer, tested directly.
 *
 * These are the first unit tests for a control in this codebase — toolbars were
 * previously only exercised through their screens, which was reasonable while
 * every one of them was a private copy. Now that fifteen screens share these
 * files, a break here breaks all fifteen, so they get tested where they live.
 *
 * Screen tests keep their job: asserting that a filter reaches the service.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  FilterChips,
  FilterDateRange,
  FilterMultiSelect,
  FilterSelect,
  FilterToggle,
  triState,
  withAll,
  type FilterOption,
} from "@/components/filters";

const WAREHOUSES: FilterOption<string>[] = withAll(
  [
    { value: "w1", label: "Gudang Pusat" },
    { value: "w2", label: "Gudang Barat" },
    { value: "w3", label: "Gudang Timur" },
  ],
  "Semua",
);

describe("FilterSelect", () => {
  it("reads Label: Value and marks itself inactive at the unset value", () => {
    render(
      <FilterSelect
        label="Gudang"
        value=""
        options={WAREHOUSES}
        onChange={jest.fn()}
      />,
    );

    const trigger = screen.getByLabelText("Gudang");
    expect(trigger).toHaveTextContent("Gudang:");
    expect(trigger).toHaveTextContent("Semua");
    // The navy "a filter is applied" state hangs off this attribute.
    expect(trigger).toHaveAttribute("data-active", "false");
  });

  it("goes active and shows the option's label once a value is set", () => {
    render(
      <FilterSelect
        label="Gudang"
        value="w1"
        options={WAREHOUSES}
        onChange={jest.fn()}
      />,
    );

    const trigger = screen.getByLabelText("Gudang");
    expect(trigger).toHaveTextContent("Gudang Pusat");
    expect(trigger).toHaveAttribute("data-active", "true");
  });

  it("treats a caller-named unset value as 'not filtering'", () => {
    // SuppliersToolbar's case: "all" is a real domain value, not a sentinel,
    // so the control must be told which row means no filter.
    render(
      <FilterSelect
        label="Status"
        value="all"
        unsetValue="all"
        options={[
          { value: "all", label: "Aktif & nonaktif" },
          { value: "active", label: "Hanya aktif" },
        ]}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Status")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("applies on pick and closes — one click, one result", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterSelect
        label="Gudang"
        value=""
        options={WAREHOUSES}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Gudang"));
    await user.click(await screen.findByRole("option", { name: "Gudang Barat" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("w2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters the list from the in-popover search box, case-insensitively", async () => {
    const user = userEvent.setup();
    render(
      <FilterSelect
        label="Gudang"
        value=""
        options={WAREHOUSES}
        onChange={jest.fn()}
        searchable
      />,
    );

    await user.click(screen.getByLabelText("Gudang"));
    await user.type(await screen.findByLabelText("Cari gudang"), "bar");

    expect(screen.getByRole("option", { name: "Gudang Barat" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Gudang Timur" })).not.toBeInTheDocument();
  });

  it("picks with the keyboard and closes on Escape", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterSelect
        label="Gudang"
        value=""
        options={WAREHOUSES}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByLabelText("Gudang");
    await user.click(trigger);
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("w1");

    await user.click(trigger);
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("is genuinely disabled, not merely styled as such", () => {
    render(
      <FilterSelect
        label="Rentang kedaluwarsa"
        value=""
        options={WAREHOUSES}
        onChange={jest.fn()}
        disabled
      />,
    );

    expect(screen.getByLabelText("Rentang kedaluwarsa")).toBeDisabled();
  });

  it("round-trips the boolean tri-state without a cast at the call site", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterSelect
        label="Status"
        value=""
        options={triState({
          all: "Semua status",
          yes: "Aktif",
          no: "Nonaktif",
        })}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "Nonaktif" }));

    // A real boolean, not the string "inactive" — that round-trip was the only
    // reason twenty-two call sites carried casts.
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("FilterMultiSelect", () => {
  const CATEGORIES: FilterOption<string>[] = [
    { value: "c1", label: "Makanan" },
    { value: "c2", label: "Aksesoris" },
    { value: "c3", label: "Obat" },
  ];

  it("does not apply or close while options are being ticked", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterMultiSelect
        label="Kategori"
        values={[]}
        options={CATEGORIES}
        onApply={onApply}
        onReset={jest.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Kategori"));
    await user.click(await screen.findByRole("option", { name: "Makanan" }));
    await user.click(screen.getByRole("option", { name: "Obat" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("commits the whole draft on Terapkan", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterMultiSelect
        label="Kategori"
        values={[]}
        options={CATEGORIES}
        onApply={onApply}
        onReset={jest.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Kategori"));
    await user.click(await screen.findByRole("option", { name: "Makanan" }));
    await user.click(screen.getByRole("option", { name: "Obat" }));
    await user.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(onApply).toHaveBeenCalledWith(["c1", "c3"]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("counts applied values in the trigger", () => {
    render(
      <FilterMultiSelect
        label="Kategori"
        values={["c1", "c2"]}
        options={CATEGORIES}
        onApply={jest.fn()}
        onReset={jest.fn()}
      />,
    );

    const trigger = screen.getByLabelText("Kategori");
    expect(trigger).toHaveTextContent("(2)");
    expect(trigger).toHaveAttribute("data-active", "true");
  });
});

describe("FilterDateRange", () => {
  it("fills both inputs from a preset without applying it", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterDateRange from="" to="" onApply={onApply} />,
    );

    await user.click(screen.getByLabelText("Tanggal"));
    await user.click(await screen.findByRole("button", { name: "Hari ini" }));

    // A preset is a shortcut for filling the fields, not for asking the
    // question — it can still be adjusted before it counts.
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tanggal dari")).toHaveValue();

    await user.click(screen.getByRole("button", { name: "Terapkan" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("summarises an applied range in Indonesian", () => {
    render(
      <FilterDateRange from="2026-08-01" to="2026-08-14" onApply={jest.fn()} />,
    );

    const trigger = screen.getByLabelText("Tanggal");
    expect(trigger).toHaveTextContent("1 Ags–14 Ags");
    expect(trigger).toHaveAttribute("data-active", "true");
  });

  it("clears and applies in the same click on Reset", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterDateRange from="2026-08-01" to="2026-08-14" onApply={onApply} />,
    );

    await user.click(screen.getByLabelText("Tanggal"));
    await user.click(await screen.findByRole("button", { name: "Reset" }));

    // Reset never waits for Terapkan — see docs/ui-rules.md §8.
    expect(onApply).toHaveBeenCalledWith({ from: "", to: "" });
  });
});

describe("FilterToggle", () => {
  it("is reachable by its label, the way the screen tests drive it", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <FilterToggle
          label="Tampilkan terhapus"
          checked={on}
          onChange={setOn}
        />
      );
    }
    render(<Harness />);

    const box = screen.getByLabelText("Tampilkan terhapus");
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
  });
});

describe("FilterChips", () => {
  it("labels each remove button with the filter it removes", async () => {
    const onRemove = jest.fn();
    const user = userEvent.setup();
    render(
      <FilterChips
        items={[{ key: "g", label: "Gudang: Pusat", onRemove }]}
      />,
    );

    // A bare X is not a label — a screen reader would announce nothing useful.
    await user.click(
      screen.getByRole("button", { name: "Hapus filter Gudang: Pusat" }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when no filter is applied", () => {
    const { container } = render(<FilterChips items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
