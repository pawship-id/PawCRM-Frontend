import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkuText } from "@/components/SkuText";

/**
 * Up to 15 characters an SKU is shown whole; a longer one is cut, and the cut
 * text opens the full code (16 October 2026).
 */
describe("SkuText", () => {
  it("shows a short SKU whole, with nothing to press", () => {
    render(<SkuText value="WHISKAS:TUNA" />);

    expect(screen.getByText("WHISKAS:TUNA")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("highlights a search term in a whole SKU", () => {
    render(<SkuText value="WHISKAS:TUNA" query="tuna" />);

    expect(screen.getByText("TUNA").tagName).toBe("MARK");
  });

  it("shows the fallback when there is no SKU", () => {
    render(<SkuText value={null} fallback="—" />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("cuts a long SKU at 15 characters and opens the full one on a tap", async () => {
    const user = userEvent.setup();
    render(<SkuText value="WHISKASPOUCH:TUNA-85G" />);

    const trigger = screen.getByRole("button", {
      name: "WHISKASPOUCH:TUNA-85G",
    });
    expect(trigger).toHaveTextContent("WHISKASPOUCH:TU…");

    await user.click(trigger);

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "WHISKASPOUCH:TUNA-85G",
    );
  });
});
