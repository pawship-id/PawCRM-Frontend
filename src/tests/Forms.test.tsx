/**
 * The form layer, tested directly — the same argument as Filters.test.tsx.
 *
 * Twenty forms are about to be moved onto these five components, so a break here
 * breaks all twenty. The screen tests keep their own job: asserting that a form
 * reaches its service with the right payload.
 *
 * What is asserted is the CONTRACT the guideline cares about — label above the
 * control and wired to it, one error that is red and announced, a hint that
 * steps aside for that error, Batal before Simpan, and a save button that says
 * what it saves. Pixel heights are not asserted: they are a class, and a test
 * that reads back its own className teaches nothing.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  CheckRow,
  CheckRowGroup,
  FormActionBar,
  SelectField,
  TextareaField,
} from "@/components/form";
import { TextField } from "@/components/TextField";
import { FilterSelect, type FilterOption } from "@/components/filters";

const WAREHOUSES: FilterOption<string>[] = [
  { value: "w1", label: "Gudang Pusat" },
  { value: "w2", label: "Gudang Bazar" },
  { value: "w3", label: "Gudang Timur" },
];

const UNITS = [
  { value: "pcs", label: "pcs" },
  { value: "box", label: "box" },
  { value: "kg", label: "kg" },
];

describe("FormField wiring, through TextField", () => {
  it("labels the control and marks a required field", () => {
    render(<TextField label="Nama produk" required />);

    const input = screen.getByLabelText(/Nama produk/);
    expect(input).toBeRequired();
  });

  it("announces an error and drops the hint while it stands", () => {
    const { rerender } = render(
      <TextField label="SKU" hint="Unik per tenant" />,
    );
    expect(screen.getByText("Unik per tenant")).toBeInTheDocument();

    rerender(<TextField label="SKU" hint="Unik per tenant" error="SKU sudah dipakai" />);

    // The hint steps aside: two descriptions on one field is one the reader
    // hears and one they do not.
    expect(screen.queryByText("Unik per tenant")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("SKU sudah dipakai");
    expect(screen.getByLabelText("SKU")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("TextareaField", () => {
  it("is a real textarea, so a reason can be re-read before saving", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <TextareaField
          label="Keterangan"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Harness />);

    const field = screen.getByLabelText("Keterangan");
    expect(field.tagName).toBe("TEXTAREA");

    await user.type(field, "Rusak kena air{enter}dua karton");
    expect(field).toHaveValue("Rusak kena air\ndua karton");
  });
});

describe("SelectField", () => {
  it("shows the placeholder while nothing is chosen, then the chosen label", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [unit, setUnit] = useState("");
      return (
        <SelectField
          label="Satuan"
          value={unit}
          onChange={setUnit}
          options={UNITS}
          placeholder="Pilih satuan"
        />
      );
    }
    render(<Harness />);

    const trigger = screen.getByLabelText("Satuan");
    expect(trigger).toHaveTextContent("Pilih satuan");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "box" }));

    expect(trigger).toHaveTextContent("box");
  });
});

describe('FilterSelect layout="form" — the searchable field', () => {
  it("searches inside the popover and closes on a pick", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [warehouse, setWarehouse] = useState("");
      return (
        <FilterSelect
          layout="form"
          label="Gudang"
          value={warehouse}
          options={WAREHOUSES}
          active={false}
          required
          placeholder="Pilih gudang"
          searchable
          onChange={setWarehouse}
        />
      );
    }
    render(<Harness />);

    const trigger = screen.getByLabelText("Gudang");
    expect(trigger).toHaveTextContent("Pilih gudang");

    await user.click(trigger);
    await user.type(screen.getByLabelText("Cari gudang"), "bazar");
    expect(screen.getByRole("option", { name: "Gudang Bazar" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Pusat" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Gudang Bazar" }));

    // A form field is not a query: there is no Terapkan, so picking is the end
    // of the interaction.
    expect(trigger).toHaveTextContent("Gudang Bazar");
  });

  it("announces an error and marks the trigger, replacing the hint", () => {
    render(
      <FilterSelect
        layout="form"
        label="Gudang"
        value=""
        options={WAREHOUSES}
        active={false}
        required
        placeholder="Pilih gudang"
        disabled
        disabledHint="Pilih cabang dulu"
        error="Gudang wajib dipilih"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Gudang wajib dipilih");
    expect(screen.queryByText("Pilih cabang dulu")).not.toBeInTheDocument();
    // The red border and the red sentence cannot disagree.
    expect(screen.getByLabelText("Gudang")).toHaveAttribute("data-invalid", "true");
  });
});

describe("CheckRow", () => {
  it("toggles from the description, not only from the box", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <CheckRowGroup>
          <CheckRow
            label="Produk punya masa kedaluwarsa"
            description="Setiap penerimaan wajib mengisi kode batch dan tanggal kedaluwarsa."
            checked={checked}
            onCheckedChange={setChecked}
          />
        </CheckRowGroup>
      );
    }
    render(<Harness />);

    // Named by the title ALONE — the forty-word description is a description,
    // not a name, so an exact query still finds the box.
    const box = screen.getByRole("checkbox", {
      name: "Produk punya masa kedaluwarsa",
    });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      "Setiap penerimaan wajib mengisi kode batch dan tanggal kedaluwarsa.",
    );

    await user.click(
      screen.getByText(/Setiap penerimaan wajib mengisi kode batch/),
    );
    expect(box).toBeChecked();
  });
});

describe("FormActionBar", () => {
  it("puts Batal before Simpan and names what it saves", () => {
    render(
      <form>
        <FormActionBar
          title="Penyesuaian baru"
          meta="No. [auto] · 0 produk"
          submitLabel="Simpan penyesuaian"
          onCancel={jest.fn()}
        />
      </form>,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Batal");
    expect(buttons[1]).toHaveTextContent("Simpan penyesuaian");
    expect(buttons[1]).toHaveAttribute("type", "submit");
  });

  it("explains a disabled Simpan instead of leaving a dead grey button", () => {
    render(
      <form>
        <FormActionBar
          title="Penyesuaian baru"
          meta="No. [auto] · 0 produk"
          submitLabel="Simpan penyesuaian"
          disabled
          blockedReason="Gudang belum dipilih"
        />
      </form>,
    );

    expect(
      screen.getByRole("button", { name: "Simpan penyesuaian" }),
    ).toBeDisabled();
    expect(screen.getByText(/Gudang belum dipilih/)).toBeInTheDocument();
    // The reason replaces the meta line rather than stacking under it.
    expect(screen.queryByText(/0 produk/)).not.toBeInTheDocument();
  });

  it("blocks a second click while a save is in flight", () => {
    render(
      <form>
        <FormActionBar
          title="Produk baru"
          submitLabel="Simpan produk"
          submitting
          onCancel={jest.fn()}
        />
      </form>,
    );

    const bar = screen.getByRole("button", { name: /Menyimpan/ });
    expect(bar).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
  });

  it("renders Batal as a link when it is a route", () => {
    render(
      <form>
        <FormActionBar
          title="Kategori baru"
          submitLabel="Simpan kategori"
          cancelHref="/dashboard/inventory/categories"
        />
      </form>,
    );

    const cancel = screen.getByRole("link", { name: "Batal" });
    expect(cancel).toHaveAttribute("href", "/dashboard/inventory/categories");
  });

  it("keeps extra actions on the left of Batal, never displacing Simpan", () => {
    render(
      <form>
        <FormActionBar
          title="Faktur baru"
          submitLabel="Simpan faktur"
          onCancel={jest.fn()}
          extra={<button type="button">Pratinjau</button>}
        />
      </form>,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Pratinjau",
      "Batal",
      "Simpan faktur",
    ]);
  });
});

describe("the form layer as one system", () => {
  it("assembles a transaction header in the guideline's field order", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());

    function Harness() {
      const [date, setDate] = useState("");
      const [warehouse, setWarehouse] = useState("");
      const [notes, setNotes] = useState("");

      return (
        <form onSubmit={onSubmit}>
          <FormActionBar
            title="Penyesuaian baru"
            meta="No. [auto] · 0 produk"
            submitLabel="Simpan penyesuaian"
            disabled={!warehouse}
            blockedReason="Gudang belum dipilih"
            onCancel={jest.fn()}
          />
          <TextField
            label="Tanggal"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <FilterSelect
            layout="form"
            label="Gudang"
            required
            value={warehouse}
            onChange={setWarehouse}
            options={WAREHOUSES}
            active={false}
            placeholder="Pilih gudang"
          />
          <TextareaField
            label="Keterangan"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </form>
      );
    }
    render(<Harness />);

    const save = screen.getByRole("button", { name: "Simpan penyesuaian" });
    expect(save).toBeDisabled();

    // Tanggal is `required`, so it also has to be answered — native constraint
    // validation would otherwise refuse the submit and the bar would look broken.
    await user.type(screen.getByLabelText(/Tanggal/), "2026-08-24");

    await user.click(screen.getByLabelText("Gudang"));
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Gudang Pusat",
      }),
    );

    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
