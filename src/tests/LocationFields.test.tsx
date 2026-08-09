import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  LocationFields,
  toGeoLocation,
  toLocationFieldsValue,
  validateLocationFields,
} from "@/components";
import type { LocationFieldsValue } from "@/components";

/**
 * Tests for the coordinate entry component and its three pure helpers.
 *
 * This is the seam the Google Maps place picker will replace, so the helpers
 * are tested directly: they are the contract the four forms depend on, and they
 * must keep behaving identically when the inputs become a map.
 */

/** A controlled host, since the component is deliberately stateless. */
function Harness({
  initial = { lat: "", lng: "" },
  errors,
}: {
  initial?: LocationFieldsValue;
  errors?: Record<string, string>;
}) {
  const [value, setValue] = useState(initial);
  return <LocationFields value={value} onChange={setValue} errors={errors} />;
}

describe("toLocationFieldsValue", () => {
  it("renders a stored pin as strings", () => {
    expect(toLocationFieldsValue({ lat: -6.260712, lng: 106.813377 })).toEqual({
      lat: "-6.260712",
      lng: "106.813377",
    });
  });

  it("renders a null pin as empty fields", () => {
    expect(toLocationFieldsValue({ lat: null, lng: null })).toEqual({
      lat: "",
      lng: "",
    });
  });

  it("tolerates a document with no location key at all", () => {
    // Backend list reads use .lean() and skip schema defaults, so a document
    // written before the field existed arrives without it.
    expect(toLocationFieldsValue(undefined)).toEqual({ lat: "", lng: "" });
    expect(toLocationFieldsValue(null)).toEqual({ lat: "", lng: "" });
  });

  it("keeps a zero coordinate, which is a real place", () => {
    // Guards a `|| ""` fallback: 0 is falsy, and the Gulf of Guinea exists.
    expect(toLocationFieldsValue({ lat: 0, lng: 0 })).toEqual({
      lat: "0",
      lng: "0",
    });
  });
});

describe("toGeoLocation", () => {
  it("parses a filled pair into numbers", () => {
    expect(toGeoLocation({ lat: "-6.260712", lng: "106.813377" })).toEqual({
      lat: -6.260712,
      lng: 106.813377,
    });
  });

  it("returns null when both fields are blank", () => {
    // One representation of "no pin" leaves this file, so the four forms cannot
    // disagree about what clearing one looks like.
    expect(toGeoLocation({ lat: "", lng: "" })).toBeNull();
    expect(toGeoLocation({ lat: "   ", lng: "  " })).toBeNull();
  });
});

describe("validateLocationFields", () => {
  it("accepts a blank pair", () => {
    expect(validateLocationFields({ lat: "", lng: "" })).toEqual({});
  });

  it("accepts a valid pair", () => {
    expect(
      validateLocationFields({ lat: "-6.260712", lng: "106.813377" }),
    ).toEqual({});
  });

  it("reports an out-of-range latitude under the backend's key", () => {
    const errors = validateLocationFields({ lat: "91", lng: "106.8" });

    expect(errors["location.lat"]).toBeDefined();
  });

  it("reports a non-numeric coordinate", () => {
    const errors = validateLocationFields({ lat: "utara", lng: "106.8" });

    expect(errors["location.lat"]).toBe("Latitude must be a number");
  });

  it("reports a half pair against the field still to be filled", () => {
    expect(validateLocationFields({ lat: "-6.2", lng: "" })).toEqual({
      "location.lng": "Latitude and longitude must be filled in together",
    });
    expect(validateLocationFields({ lat: "", lng: "106.8" })).toEqual({
      "location.lat": "Latitude and longitude must be filled in together",
    });
  });

  it("does not stack a pair complaint on a malformed value", () => {
    const errors = validateLocationFields({ lat: "utara", lng: "" });

    expect(Object.keys(errors)).toEqual(["location.lat"]);
  });
});

describe("LocationFields", () => {
  it("splits a pasted “lat, lng” pair across both inputs", async () => {
    // The workflow the interim solution exists to serve: copying a pin off
    // Google Maps, which puts both numbers on the clipboard as one string.
    render(<Harness />);

    await userEvent.click(screen.getByLabelText(/latitude/i));
    await userEvent.paste("-6.26, 106.81");

    expect(screen.getByLabelText(/latitude/i)).toHaveValue("-6.26");
    expect(screen.getByLabelText(/longitude/i)).toHaveValue("106.81");
  });

  it("splits a pair pasted into the longitude field too", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByLabelText(/longitude/i));
    await userEvent.paste("-6.26, 106.81");

    expect(screen.getByLabelText(/latitude/i)).toHaveValue("-6.26");
    expect(screen.getByLabelText(/longitude/i)).toHaveValue("106.81");
  });

  it("leaves a pasted single number in the field that received it", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByLabelText(/longitude/i));
    await userEvent.paste("106.81");

    expect(screen.getByLabelText(/latitude/i)).toHaveValue("");
    expect(screen.getByLabelText(/longitude/i)).toHaveValue("106.81");
  });

  it("does not split mid-word while a pair is being typed by hand", async () => {
    // Regression: sniffing the pattern on every keystroke matches the
    // intermediate "-6.26, 1", firing the split early and sending the rest of
    // the digits into the latitude field. Typing is not pasting.
    render(<Harness />);

    await userEvent.type(screen.getByLabelText(/latitude/i), "-6.26, 106.81");

    expect(screen.getByLabelText(/latitude/i)).toHaveValue("-6.26, 106.81");
    expect(screen.getByLabelText(/longitude/i)).toHaveValue("");
  });

  it("offers a Maps link only once both coordinates are present", async () => {
    render(<Harness />);

    expect(screen.queryByRole("link", { name: /verify this pin/i })).toBeNull();

    await userEvent.click(screen.getByLabelText(/latitude/i));
    await userEvent.paste("-6.26, 106.81");

    const link = screen.getByRole("link", { name: /verify this pin/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=-6.26%2C106.81",
    );
  });

  it("shows the backend's dotted field errors without any remapping", () => {
    // Joi reports nested paths as "location.lat" and ApiError.fieldErrors strips
    // only the leading "body.", so a form hands its whole map straight through.
    render(
      <Harness
        errors={{
          "location.lat": "Latitude must be a number",
          "location.lng": "Longitude must be a number",
        }}
      />,
    );

    expect(screen.getByText("Latitude must be a number")).toBeInTheDocument();
    expect(screen.getByText("Longitude must be a number")).toBeInTheDocument();
  });

  it("shows the pair-level error the backend reports against the object", () => {
    // `.and("lat", "lng")` fails on the object itself, so the key has no leaf.
    render(
      <Harness
        errors={{ location: "latitude and longitude must be provided together" }}
      />,
    );

    expect(
      screen.getByText("latitude and longitude must be provided together"),
    ).toBeInTheDocument();
  });
});
