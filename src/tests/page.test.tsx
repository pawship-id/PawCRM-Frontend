import { render, screen } from "@testing-library/react";

import Home, { metadata } from "@/app/page";

jest.mock("@/features/landing", () => ({
  LandingScreen: () => <div>landing</div>,
}));

/**
 * The root route.
 *
 * IT USED TO REDIRECT TO `/login` and this file asserted exactly that. The page
 * changed — there is a marketing landing page now, and `src/app/page.tsx` says
 * why in its own header — but the test did not, so it failed against a
 * deliberate change rather than against a mistake. Its real job survives that:
 * it is also the smoke check that next/jest, the SWC transform and the `@/`
 * alias are wired up at all, which is why it is the one test that imports a
 * route module directly.
 *
 * `LandingScreen` IS STUBBED. What is asserted here is the ROUTE — that `/`
 * renders the landing surface and is public — not what the marketing page says;
 * that belongs to the landing feature's own tests, and pulling the real one in
 * would make this smoke check fail for a copy change.
 */
describe("Home page", () => {
  it("renders the landing page rather than redirecting", () => {
    render(<Home />);

    expect(screen.getByText("landing")).toBeInTheDocument();
  });

  it("carries the metadata a public page is found by", () => {
    // `/` is the one route a visitor with no account reaches, so its title and
    // description are the product's front door rather than decoration.
    expect(metadata.title).toEqual(expect.stringContaining("Buloo"));
    expect(metadata.description).toEqual(expect.any(String));
  });
});
