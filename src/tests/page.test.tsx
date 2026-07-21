import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

/**
 * Smoke test for the component testing setup: proves next/jest, the SWC
 * transform, JSX, the @/ alias and jest-dom matchers are all wired up.
 */
describe("Home page", () => {
  it("renders the application name", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "PawCRM" }),
    ).toBeInTheDocument();
  });

  it("renders inside a main landmark", () => {
    render(<Home />);

    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
