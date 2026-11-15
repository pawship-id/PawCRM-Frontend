import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DEFAULT_PAGE_SIZE,
  ListFooter,
  PAGE_SIZE_OPTIONS,
} from "@/components/ListFooter";

describe("ListFooter — the one pager every list uses", () => {
  it("starts at 25 and offers 25 / 50 / 100 when the caller passes no sizes", async () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect([...PAGE_SIZE_OPTIONS]).toEqual([25, 50, 100]);

    const onPageSizeChange = jest.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ListFooter
        page={1}
        pageSize={DEFAULT_PAGE_SIZE}
        total={80}
        totalPages={4}
        unit="produk"
        onPageChange={jest.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByText("Menampilkan 1–25 dari 80 produk")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Baris per halaman"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["25", "50", "100"]);

    await user.click(screen.getByRole("option", { name: "100" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });

  it("keeps the count and size control at one page, and hides only the pager", () => {
    render(
      <ListFooter
        page={1}
        pageSize={25}
        total={7}
        totalPages={1}
        onPageChange={jest.fn()}
        onPageSizeChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/Menampilkan 1–7 dari 7/)).toBeInTheDocument();
    expect(screen.getByLabelText("Baris per halaman")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Paginasi" })).not.toBeInTheDocument();
  });

  it("moves between pages from the numbered pager", async () => {
    const onPageChange = jest.fn();
    render(
      <ListFooter
        page={2}
        pageSize={25}
        total={120}
        totalPages={5}
        onPageChange={onPageChange}
        onPageSizeChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Halaman 2")).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByLabelText("Halaman 3"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
