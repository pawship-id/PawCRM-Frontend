import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DataTable,
  nextSortOf,
  sortDirectionOf,
  type DataTableColumn,
  type SortOptions,
} from "@/components";

/**
 * THE shared list table. What it guards: a header sorts only when the screen
 * names an API ordering for it, the first click takes the column's natural
 * direction and the next flips it, the active column says which way it runs
 * (arrow + aria-sort), and the loading / empty rows behave the same on every
 * screen.
 */

type Sort = "nameAsc" | "nameDesc" | "newest" | "oldest";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Nama", cell: (row) => row.name },
  { id: "date", header: "Tanggal", cell: () => "1 Okt 2026" },
  { id: "note", header: "Catatan", cell: () => "—" },
];

const options: SortOptions<Sort> = {
  name: { asc: "nameAsc", desc: "nameDesc" },
  date: { asc: "oldest", desc: "newest", first: "desc" },
};

const rows: Row[] = [
  { id: "a", name: "Anjing" },
  { id: "b", name: "Burung" },
];

function renderTable(value: Sort, onChange = jest.fn()) {
  render(
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      sort={{ value, options, onChange }}
    />,
  );
  return onChange;
}

describe("sort helpers", () => {
  it("reads which way the current ordering runs a column", () => {
    expect(sortDirectionOf(options.name, "nameAsc")).toBe("asc");
    expect(sortDirectionOf(options.name, "nameDesc")).toBe("desc");
    expect(sortDirectionOf(options.name, "newest")).toBeNull();
  });

  it("starts a column at its natural direction, then flips it", () => {
    expect(nextSortOf(options.name, "newest")).toBe("nameAsc");
    expect(nextSortOf(options.date, "nameAsc")).toBe("newest");
    expect(nextSortOf(options.date, "newest")).toBe("oldest");
    expect(nextSortOf(options.date, "oldest")).toBe("newest");
  });
});

describe("DataTable", () => {
  it("makes only the columns with an API ordering clickable", () => {
    renderTable("newest");

    expect(screen.getByRole("button", { name: "Nama" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tanggal" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Catatan" }),
    ).not.toBeInTheDocument();
  });

  it("marks the active column with aria-sort", () => {
    renderTable("newest");

    expect(screen.getByRole("columnheader", { name: "Tanggal" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: "Nama" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("asks for the next ordering on a header click", async () => {
    const onChange = renderTable("newest");

    await userEvent.click(screen.getByRole("button", { name: "Nama" }));
    expect(onChange).toHaveBeenLastCalledWith("nameAsc");

    await userEvent.click(screen.getByRole("button", { name: "Tanggal" }));
    expect(onChange).toHaveBeenLastCalledWith("oldest");
  });

  it("keeps the rows on screen, dimmed, while a re-sort loads", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading
      />,
    );

    expect(screen.getByText("Anjing")).toBeInTheDocument();
    expect(screen.queryByText("Memuat…")).not.toBeInTheDocument();
  });

  it("shows a spinner row before the first rows arrive", () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(row) => row.id} loading />,
    );

    expect(screen.getByText("Memuat…")).toBeInTheDocument();
  });

  it("renders the empty state across the whole row", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<p>Belum ada data</p>}
      />,
    );

    const cell = screen.getByText("Belum ada data").closest("td");
    expect(cell).toHaveAttribute("colspan", "3");
  });

  it("opens a row on click and on Enter", async () => {
    const onRowClick = jest.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByText("Burung").closest("tr")!;
    await userEvent.click(within(row).getByText("Burung"));
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);

    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});
