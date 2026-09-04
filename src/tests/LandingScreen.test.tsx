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
    // The nav button is an anchor into the closing section, which exists.
    const { container } = render(<LandingScreen />);
    expect(container.querySelector("#coba")).not.toBeNull();

    expect(
      screen.getAllByRole("link", { name: /Minta akses uji coba/ }).length,
    ).toBe(2);
    expect(screen.getAllByRole("link", { name: /Masuk/ })[0]).toHaveAttribute(
      "href",
      "/login",
    );
  });

  /*
    NO BUTTON PROMISES A DOOR THAT IS NOT THERE. There is no signup route in the
    backend — auth.routes.js says so on purpose — so nothing on this page may
    read as "sign up and start". This test is what fails if somebody restores
    the old "Coba gratis 14 hari" label without building the flow behind it.
  */
  it("never offers a self-serve signup", () => {
    render(<LandingScreen />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent).not.toMatch(/Coba gratis|Daftar sekarang/i);
    }
  });

  /*
    THE NUMBER IS CONFIGURATION, NOT MARKUP. Both WhatsApp links — the closing
    button and the footer — read the same resolved value, so a number change is
    one env var rather than a grep.
  */
  it("points every WhatsApp link at the configured number", () => {
    render(<LandingScreen />);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("https://wa.me/"));

    expect(hrefs.length).toBeGreaterThan(0);
    expect(env.whatsappNumber).toMatch(/^\d+$/);
    for (const href of hrefs) {
      expect(href.startsWith(`https://wa.me/${env.whatsappNumber}?`)).toBe(true);
    }
  });

  /*
    THE MESSAGE IS THE FORM. Until an enquiry has somewhere to be stored, the
    three things setting a tenant up needs are asked in the chat instead — and
    an unencoded newline is what would quietly drop them.
  */
  it("prefills the trial message with what setting up an account needs", () => {
    render(<LandingScreen />);

    const href =
      screen
        .getAllByRole("link", { name: /Minta akses uji coba/ })[0]
        .getAttribute("href") ?? "";
    const text = decodeURIComponent(href.split("?text=")[1] ?? "");

    expect(text).toMatch(/uji coba 14 hari/);
    expect(text).toMatch(/Nama toko:/);
    expect(text).toMatch(/Jumlah cabang:/);
    // Encoded, so the newlines survive the trip into WhatsApp.
    expect(href).not.toContain("\n");
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
