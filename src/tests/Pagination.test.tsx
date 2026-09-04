import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Pagination, getPageItems } from "@/components/Pagination";

describe("getPageItems", () => {
  it("lists every page with no ellipsis when the range is small", () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses the far end with an ellipsis near the start", () => {
    expect(getPageItems(2, 10)).toEqual([1, 2, 3, "ellipsis", 10]);
  });

  it("collapses both ends around the middle", () => {
    expect(getPageItems(5, 10)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ]);
  });

  it("shows a single hidden page as a number, not an ellipsis", () => {
    // Gap between 1 and 3 is one page — render 2 rather than "…".
    expect(getPageItems(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={3} onPageChange={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page and calls onPageChange for a number click", async () => {
    const onPageChange = jest.fn();
    render(
      <Pagination
        page={2}
        totalPages={5}
        total={100}
        unit="event"
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByLabelText("Halaman 2")).toHaveAttribute(
      "aria-current",
      "page",
    );

    await userEvent.click(screen.getByLabelText("Halaman 3"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables Sebelumnya on the first page and Berikutnya on the last", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} total={50} onPageChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Berikutnya" })).toBeEnabled();

    rerender(
      <Pagination page={3} totalPages={3} total={50} onPageChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  });
});

/**
 * The count's noun.
 *
 * `unitPlural` used to default to `${unit}s`, which was right when this
 * component spoke English and quietly wrong the moment it did not: a caller
 * passing only `unit="produk"` got "3 produks". Indonesian does not inflect for
 * number, so the default is now the word itself.
 */
describe("Pagination — counting things in Indonesian", () => {
  it("does not append an English plural to an Indonesian noun", () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={12}
        unit="produk"
        onPageChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/12 produk/)).toBeInTheDocument();
    expect(screen.queryByText(/produks/)).not.toBeInTheDocument();
  });

  it("reads the same at one as at many", () => {
    render(
      <Pagination
        page={1}
        totalPages={2}
        total={1}
        unit="produk"
        onPageChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/1 produk/)).toBeInTheDocument();
  });

  it("still honours an explicit plural where a caller wants one", () => {
    // Kept because 27 call sites pass it, not because it earns its place.
    render(
      <Pagination
        page={1}
        totalPages={2}
        total={5}
        unit="orang"
        unitPlural="orang-orang"
        onPageChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/5 orang-orang/)).toBeInTheDocument();
  });

  it("names the page in Indonesian", () => {
    render(
      <Pagination
        page={2}
        totalPages={5}
        total={50}
        unit="produk"
        onPageChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/Halaman 2 dari 5/)).toBeInTheDocument();
  });
});
