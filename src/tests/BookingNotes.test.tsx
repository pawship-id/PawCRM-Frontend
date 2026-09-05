import { render, screen } from "@testing-library/react";

import { BookingNotes } from "@/features/booking/components/BookingNotes";

/**
 * ONE ANIMAL'S TWO NOTES, ON A SCREEN THAT SHOWS BOTH.
 *
 * WHAT THESE PIN is the labelling. Storing the halves apart is worth nothing if
 * the screen prints them as two bare paragraphs: somebody reading a booking
 * aloud at the counter would have no way to tell which sentence the owner is
 * meant to hear, which is the leak the split exists to prevent.
 */
describe("BookingNotes", () => {
  it("names the audience of each note", () => {
    render(
      <BookingNotes
        internalNotes="Pemiliknya suka ngeyel soal harga"
        customerNotes="Bulunya kusut, sarankan 3 minggu sekali"
      />,
    );

    expect(screen.getByText("Catatan internal")).toBeInTheDocument();
    expect(screen.getByText("Untuk pelanggan")).toBeInTheDocument();
  });

  it("keeps each sentence under its own label", () => {
    /*
      THE ONE FAILURE THAT WOULD MATTER: the internal remark rendered under the
      customer's heading. Asserting the pairing rather than mere presence is
      what makes that a red test instead of a green one.
    */
    render(
      <BookingNotes
        internalNotes="Pemiliknya suka ngeyel soal harga"
        customerNotes="Bulunya kusut, sarankan 3 minggu sekali"
      />,
    );

    const internal = screen.getByText("Catatan internal").parentElement;
    const forOwner = screen.getByText("Untuk pelanggan").parentElement;

    expect(internal).toHaveTextContent("suka ngeyel soal harga");
    expect(internal).not.toHaveTextContent("Bulunya kusut");
    expect(forOwner).toHaveTextContent("Bulunya kusut");
    expect(forOwner).not.toHaveTextContent("suka ngeyel");
  });

  it("shows only the half that was written", () => {
    // The common case: an operational note and nothing to tell the owner.
    render(
      <BookingNotes internalNotes="Takut hairdryer" customerNotes={null} />,
    );

    expect(screen.getByText("Catatan internal")).toBeInTheDocument();
    expect(screen.queryByText("Untuk pelanggan")).not.toBeInTheDocument();
  });

  it("renders nothing at all when there is neither", () => {
    // Most visits have neither, and two empty labelled boxes on every service
    // is the clutter this form spent a redesign removing.
    const { container } = render(
      <BookingNotes internalNotes={null} customerNotes={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
