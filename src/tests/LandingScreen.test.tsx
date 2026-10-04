import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LandingScreen } from "@/features/landing";
import { env } from "@/utils/env";
import {
  FLOW_ROWS,
  HERO_TABS,
  LANDING_SECTIONS,
  PROCESS_STEPS,
  WHY_CARDS,
} from "@/features/landing/content";

/**
 * The landing page at `/`.
 *
 * WHAT IS WORTH TESTING ON A MARKETING PAGE is not that the copy renders —
 * that is what the copy is. It is the parts that quietly rot: the in-page
 * anchors, which break the moment a section is renamed on one side only; the
 * one interactive thing on the page; and the promise every button makes.
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
    // The nav button is an anchor into the process section, which exists.
    const { container } = render(<LandingScreen />);
    expect(container.querySelector("#proses")).not.toBeNull();

    expect(
      screen.getAllByRole("link", { name: "Konsultasi gratis" }).length,
    ).toBe(2);
    expect(
      screen.getAllByRole("link", { name: "Jadwalkan konsultasi" }).length,
    ).toBe(2);
    expect(screen.getAllByRole("link", { name: /Masuk/ })[0]).toHaveAttribute(
      "href",
      "/login",
    );
  });

  /*
    NO BUTTON PROMISES A DOOR THAT IS NOT THERE. There is no signup route in the
    backend — auth.routes.js says so on purpose — so nothing on this page may
    read as "sign up and start". Every call to action opens a conversation
    instead, which is what the process section says happens.
  */
  it("never offers a self-serve signup", () => {
    render(<LandingScreen />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent).not.toMatch(
        /Coba gratis|Daftar sekarang|Buat akun/i,
      );
    }
  });

  /*
    THE NUMBER IS CONFIGURATION, NOT MARKUP. Every WhatsApp link on the page —
    hero, process, closing section and footer — reads the same resolved value,
    so a number change is one env var rather than a grep.
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
      expect(href.startsWith(`https://wa.me/${env.whatsappNumber}?`)).toBe(
        true,
      );
    }
  });

  /*
    THE MESSAGE IS THE FORM. Until an enquiry has somewhere to be stored, the
    three things preparing for the call needs are asked in the chat instead —
    and an unencoded newline is what would quietly drop them.
  */
  it("prefills the consultation message with what preparing for it needs", () => {
    render(<LandingScreen />);

    const href =
      screen
        .getAllByRole("link", { name: "Konsultasi gratis" })
        .map((link) => link.getAttribute("href") ?? "")
        .find((value) => value.startsWith("https://wa.me/")) ?? "";
    const text = decodeURIComponent(href.split("?text=")[1] ?? "");

    expect(text).toMatch(/konsultasi gratis 30 menit/);
    expect(text).toMatch(/Nama toko:/);
    expect(text).toMatch(/Jumlah cabang:/);
    // Encoded, so the newlines survive the trip into WhatsApp.
    expect(href).not.toContain("\n");
  });

  /*
    WHATSAPP TAKES ITS OWN TAB. A prospect halfway down the page who taps a
    button and gets this one replaced has lost their place, and `rel` is the
    half of the pair that gets left off — a `_blank` without it hands the opened
    page a live handle back into this one.
  */
  it("opens every WhatsApp link in a new tab, safely", () => {
    render(<LandingScreen />);

    const links = screen
      .getAllByRole("link")
      .filter((link) =>
        (link.getAttribute("href") ?? "").startsWith("https://wa.me/"),
      );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toMatch(/noopener/);
    }
  });

  /*
    THE WORDMARK GOES BACK UP, without going through the router to reach the
    page it is already on. The href has to survive the change: it is what a
    middle click and a ⌘-click still use.
  */
  it("scrolls the wordmark back to the hero instead of navigating", async () => {
    const user = userEvent.setup();
    const scrollTo = jest
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    render(<LandingScreen />);

    const wordmark = screen.getByRole("link", { name: /^Buloo/ });
    expect(wordmark).toHaveAttribute("href", "/");

    await user.click(wordmark);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });

    scrollTo.mockRestore();
  });

  /*
    AND IT LEAVES A CLEAN ADDRESS BEHIND. Suppressing the navigation is what
    stripped the fragment's own cleanup with it — without this, reading a
    section and then clicking the wordmark leaves `/#kenapa` in the address bar
    while the page sits at the top, which is the URL somebody would copy.
  */
  it("clears the section fragment when the wordmark is clicked", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    window.history.replaceState(null, "", "/?utm_source=ig#kenapa");
    render(<LandingScreen />);

    await user.click(screen.getByRole("link", { name: /^Buloo/ }));

    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/");
    // The ad's tags are not the fragment, and are not swept up with it.
    expect(window.location.search).toBe("?utm_source=ig");

    jest.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  /*
    THE ONE INTERACTIVE THING ON THE PAGE. Three panels share one slot, so a
    broken tab does not look broken — it looks like the page only has one
    screenshot on it.
  */
  it("shows one hero panel at a time and switches on click", async () => {
    const user = userEvent.setup();
    render(<LandingScreen />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(HERO_TABS.length);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Analitik");

    await user.click(screen.getByRole("tab", { name: "Kalender booking" }));

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(
      "Kalender booking",
    );
    expect(screen.getByText("Booking minggu ini")).toBeInTheDocument();
  });

  /*
    THE ANCHORS GLIDE, AND ONLY HERE. `scroll-behavior` lives on `html`, which
    every route shares — this is the guard that the landing page arms it on the
    way in and disarms it on the way out, so navigating to the dashboard does
    not leave the whole app scrolling in slow motion.
  */
  it("arms smooth scrolling only while it is mounted", () => {
    const { unmount } = render(<LandingScreen />);
    expect(document.documentElement).toHaveAttribute("data-smooth-scroll");

    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-smooth-scroll");
  });

  it("renders both halves of every problem row", () => {
    const { container } = render(<LandingScreen />);
    const section = container.querySelector("#masalah") as HTMLElement;

    for (const row of FLOW_ROWS) {
      expect(within(section).getByText(row.nowTitle)).toBeInTheDocument();
      expect(within(section).getByText(row.fixTitle)).toBeInTheDocument();
    }
  });

  it("renders every reason and every step", () => {
    render(<LandingScreen />);

    for (const card of WHY_CARDS) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
    for (const step of PROCESS_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
  });
});
