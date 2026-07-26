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

    expect(screen.getByLabelText("Page 2")).toHaveAttribute(
      "aria-current",
      "page",
    );

    await userEvent.click(screen.getByLabelText("Page 3"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} total={50} onPageChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    rerender(
      <Pagination page={3} totalPages={3} total={50} onPageChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
