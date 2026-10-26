import { render, screen } from "@testing-library/react";

import { JatahChips, JatahRows } from "@/features/memberships/components/JatahRows";

import { benefitAvailability } from "./helpers/membershipFixture";

/**
 * JATAH HELD BY A BOOKING, SHOWN WHERE THE QUOTA IS READ (22 October 2026).
 * An unpaid booking keeps its jatah; "Sisa jatah" says so and links to it.
 */
const held = benefitAvailability({
  label: "Basic Grooming",
  cap: 3,
  used: 2,
  remaining: 0,
  reserved: 1,
  reservedBy: [
    {
      bookingId: "bk-1",
      bookingNumber: "BK-261120-001",
      scheduledAt: "2026-11-20T08:00:00.000Z",
      petId: "pet-1",
    },
  ],
});

it("says what is used, what is held, and links the holding booking", () => {
  render(<JatahRows card={{ endDate: "2027-04-20T00:00:00.000Z", benefits: [held], plan: {} as never }} />);

  expect(screen.getByText(/2 terpakai · 1 ditahan/)).toBeInTheDocument();
  expect(screen.getByText("0 tersisa")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "BK-261120-001" });
  expect(link).toHaveAttribute("href", "/dashboard/booking/bk-1");
});

it("keeps the plain 'u dari c' when nothing is held", () => {
  const free = benefitAvailability({ label: "Basic Grooming", cap: 3, used: 1, remaining: 2 });
  render(<JatahRows card={{ endDate: "2027-04-20T00:00:00.000Z", benefits: [free], plan: {} as never }} />);

  expect(screen.getByText(/1 dari 3/)).toBeInTheDocument();
  expect(screen.queryByText(/Ditahan/)).not.toBeInTheDocument();
});

it("counts held jatah on the short chip", () => {
  render(<JatahChips benefits={[held]} />);
  expect(screen.getByText("Basic Grooming 3/3")).toBeInTheDocument();
});
