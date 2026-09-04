import { render, screen, within } from "@testing-library/react";

import { LandingScreen } from "@/features/landing";
import { env } from "@/utils/env";
import {
  LANDING_SECTIONS,
  PROBLEMS,
  RELEASES,
  SCOPE,
} from "@/features/landing/content";

/**
 * The landing page at `/`.
 *
 * WHAT IS WORTH TESTING ON A MARKETING PAGE is not that the copy renders —
 * that is what the copy is. It is the two things that quietly rot: the in-page
 * anchors, which break the moment a section is renamed on one side only, and
 * the claim that the page tells the truth about what is not built yet.
 */
describe("LandingScreen", () => {
  it("gives every nav link a section to land on", () => {
    const { container } = render(<LandingScreen />);

    for (const section of LANDING_SECTIONS) {
      expect(
        screen.getAllByRole("link", { name: section.label }).length,
      ).toBeGreaterThan(0);
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
    }
  });

  it("sends the two calls to action somewhere", () => {
    // The hero button is an anchor into the closing section, which exists.
    const { container } = render(<LandingScreen />);
    expect(container.querySelector("#coba")).not.toBeNull();

    expect(
      screen.getAllByRole("link", { name: /Coba gratis 14 hari/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /Masuk/ })[0],
    ).toHaveAttribute("href", "/login");
  });

  /*
    THE NUMBER IS CONFIGURATION, NOT MARKUP. Both WhatsApp links — the closing
    button and the footer — read the same resolved value, so a number change is
    one env var rather than a grep.
  */
  it("points both WhatsApp links at the configured number", () => {
    render(<LandingScreen />);

    const expected = `https://wa.me/${env.whatsappNumber}`;
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("https://wa.me/"));

    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", expected);
    expect(env.whatsappNumber).toMatch(/^\d+$/);
  });

  /*
    THE HONESTY TEST. Hotel and E-commerce Sync are `SectionPlaceholder`s in the
    app. If either ever appears in the built list, this fails — and if one of
    them ships, this test is the reminder that the page has to change with it.
  */
  it("keeps what is not built out of the built list", () => {
    const { container } = render(<LandingScreen />);
    const scope = container.querySelector("#cakupan");
    const titles = SCOPE.map((item) => item.title).join(" ");

    expect(titles).not.toMatch(/Hotel|E-commerce/);
    expect(scope).not.toBeNull();
    expect(
      within(scope as HTMLElement).getByText(
        /Hotel dan E-commerce Sync belum jalan/,
      ),
    ).toBeInTheDocument();
  });

  it("renders every problem and every release", () => {
    render(<LandingScreen />);

    for (const problem of PROBLEMS) {
      expect(screen.getByText(`“${problem.quote}”`)).toBeInTheDocument();
    }
    for (const release of RELEASES) {
      expect(screen.getByText(release.title)).toBeInTheDocument();
    }
  });
});
