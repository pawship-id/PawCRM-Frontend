import { render, screen } from "@testing-library/react";

import { HighlightText } from "@/components/HighlightText";

describe("HighlightText", () => {
  it("wraps a case-insensitive match in a mark", () => {
    render(<HighlightText text="Failed login" query="fail" />);
    const mark = screen.getByText("Fail");
    expect(mark.tagName).toBe("MARK");
  });

  it("renders plain text when there is no query", () => {
    const { container } = render(<HighlightText text="10.0.0.5" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container).toHaveTextContent("10.0.0.5");
  });

  it("treats the query literally, not as a regex", () => {
    // "1.2" must not match "1x2"; the dot is escaped.
    const { container } = render(<HighlightText text="1x2" query="1.2" />);
    expect(container.querySelector("mark")).toBeNull();
  });

  it("highlights every occurrence", () => {
    render(<HighlightText text="log a log b" query="log" />);
    expect(screen.getAllByText("log")).toHaveLength(2);
  });
});
