import { render, screen } from "@testing-library/react";

import { BarList } from "@/features/dashboard/beranda/parts";
import { OpnameStatusBadge } from "@/features/inventory";

/**
 * Beranda's share column (Per lini bisnis, Distribusi status booking, Layanan
 * terlaris) speaks id-ID like every other percent on the page: 69,4%, never
 * the 69.4% `toFixed` used to print.
 */
describe("BarList — persen", () => {
  it("writes the share with a decimal comma", () => {
    render(
      <BarList
        title="Layanan terlaris"
        empty="Belum ada"
        rows={[
          { label: "Grooming", value: 694, display: "694 booking" },
          { label: "Penitipan", value: 306, display: "306 booking" },
        ]}
      />,
    );

    expect(screen.getByText("694 booking · 69,4%")).toBeInTheDocument();
    expect(screen.getByText("306 booking · 30,6%")).toBeInTheDocument();
  });
});

describe("OpnameStatusBadge", () => {
  it("capitalises both states", () => {
    const { rerender } = render(<OpnameStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    rerender(<OpnameStatusBadge status="submitted" />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });
});
