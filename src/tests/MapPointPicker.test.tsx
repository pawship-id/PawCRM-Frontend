import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  resolvePoint,
  TripPointFields,
  type PointDraft,
} from "@/features/antar-jemput/components/TripPointFields";
import {
  addressAt,
  mapsConfigured,
  searchAddress,
  useGoogleMaps,
} from "@/features/antar-jemput/googleMaps";
import type { Branch } from "@/types/api";

/**
 * ─── PILIH DARI PETA ───────────────────────────────────────────────────────
 *
 * The loader is mocked wholesale rather than stubbed around: `googleMaps.ts`
 * appends a `<script>` to a real CDN, and a suite that depends on Google being
 * reachable is a suite that fails on a train. What is being tested here is the
 * part that can break on its own — what the picker writes back into the field.
 */
jest.mock("@/features/antar-jemput/googleMaps", () => ({
  __esModule: true,
  mapsConfigured: jest.fn(() => true),
  useGoogleMaps: jest.fn(() => ({ state: "ready", retry: jest.fn() })),
  addressAt: jest.fn(async () => null),
  searchAddress: jest.fn(async () => null),
}));

const mockedConfigured = mapsConfigured as jest.MockedFunction<typeof mapsConfigured>;
const mockedState = useGoogleMaps as jest.MockedFunction<typeof useGoogleMaps>;
const mockedAddressAt = addressAt as jest.MockedFunction<typeof addressAt>;
const mockedSearch = searchAddress as jest.MockedFunction<typeof searchAddress>;

/** The fake `google.maps.Map`, and the handle on its `idle` event. */
let idle: (() => void) | null = null;
let centre = { lat: -6.2088, lng: 106.8456 };

beforeEach(() => {
  jest.clearAllMocks();
  mockedConfigured.mockReturnValue(true);
  mockedState.mockReturnValue({ state: "ready", retry: jest.fn() });
  mockedAddressAt.mockResolvedValue(null);
  mockedSearch.mockResolvedValue(null);

  idle = null;
  centre = { lat: -6.2088, lng: 106.8456 };

  window.google = {
    maps: {
      Map: class {
        constructor(_box: HTMLElement, options: { center: typeof centre }) {
          centre = options.center;
        }
        setCenter(next: typeof centre) {
          centre = next;
        }
        getCenter() {
          return { lat: () => centre.lat, lng: () => centre.lng };
        }
        setZoom() {}
        getZoom() {
          return 17;
        }
        panTo(next: typeof centre) {
          centre = next;
        }
        addListener(event: string, handler: () => void) {
          if (event === "idle") idle = handler;
          return {
            remove: () => {
              idle = null;
            },
          };
        }
      },
      Geocoder: class {
        geocode() {
          return Promise.resolve({ results: [] });
        }
      },
    },
  } as unknown as typeof window.google;
});

const BRANCH = {
  _id: "b1",
  name: "Buloo Bangka",
  address: "Jl. Bangka Raya 10",
  location: { lat: -6.26, lng: 106.81 },
} as unknown as Branch;

function Harness({ start }: { start?: Partial<PointDraft> }) {
  const [draft, setDraft] = useState<PointDraft>({
    source: "map",
    address: "",
    lat: "",
    lng: "",
    ...start,
  });

  return (
    <TripPointFields
      label="Alamat asal"
      draft={draft}
      point={resolvePoint(draft, null, BRANCH)}
      customer={null}
      branch={BRANCH}
      disabled={false}
      onChange={setDraft}
    />
  );
}

/** The card's own address box, as opposed to the dialog's. */
const cardAddress = () =>
  screen.getAllByLabelText(/^alamat$/i).find((field) => !field.closest("[role='dialog']"))!;

describe("Pilih dari peta", () => {
  it("asks for the point before it has one, and writes back what the search found", async () => {
    const user = userEvent.setup();
    mockedSearch.mockResolvedValue({
      point: { lat: -6.241, lng: 106.799 },
      address: "Jl. Kemang Raya No. 5, Jakarta Selatan",
    });

    render(<Harness />);

    expect(screen.getByText("Titik lokasinya belum dipilih.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pilih di peta" }));

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(/cari alamat/i), "Kemang Raya");
    await user.click(dialog.getByRole("button", { name: "Cari" }));

    await waitFor(() =>
      expect(dialog.getByLabelText(/^alamat$/i)).toHaveValue(
        "Jl. Kemang Raya No. 5, Jakarta Selatan",
      ),
    );
    expect(dialog.getByText(/Titik: -6\.241000, 106\.799000/)).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Gunakan titik ini" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Titik: -6.241, 106.799")).toBeInTheDocument();
    expect(cardAddress()).toHaveValue("Jl. Kemang Raya No. 5, Jakarta Selatan");
  });

  it("names the address under the pin once the map has settled", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedAddressAt.mockResolvedValue("Jl. Bangka Raya No. 10, Jakarta Selatan");

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Pilih di peta" }));

    const dialog = within(await screen.findByRole("dialog"));

    /*
      The map is dragged: the centre moves, then `idle` fires. In `act`, so the
      re-render lands before the timers are advanced — otherwise the debounce
      still holds the point the dialog opened on.
    */
    centre = { lat: -6.262, lng: 106.812 };
    await act(async () => {
      idle!();
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });

    await waitFor(() =>
      expect(dialog.getByLabelText(/^alamat$/i)).toHaveValue(
        "Jl. Bangka Raya No. 10, Jakarta Selatan",
      ),
    );
    expect(mockedAddressAt).toHaveBeenLastCalledWith({ lat: -6.262, lng: 106.812 });

    jest.useRealTimers();
  });

  it("does not spend a lookup on the point it opened with", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Harness
        start={{ address: "Jl. Bangka Raya 10, pagar hijau", lat: "-6.26", lng: "106.81" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ubah titik" }));

    const dialog = within(await screen.findByRole("dialog"));
    await act(async () => {
      idle!();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });

    expect(mockedAddressAt).not.toHaveBeenCalled();
    /* And the landmark somebody typed is still there to be saved. */
    expect(dialog.getByLabelText(/^alamat$/i)).toHaveValue(
      "Jl. Bangka Raya 10, pagar hijau",
    );

    jest.useRealTimers();
  });

  it("leaves the field untouched when the picker is cancelled", async () => {
    const user = userEvent.setup();
    mockedSearch.mockResolvedValue({
      point: { lat: -6.241, lng: 106.799 },
      address: "Jl. Kemang Raya No. 5",
    });

    render(<Harness start={{ address: "Alamat lama", lat: "-6.26", lng: "106.81" }} />);
    await user.click(screen.getByRole("button", { name: "Ubah titik" }));

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(/cari alamat/i), "Kemang");
    await user.click(dialog.getByRole("button", { name: "Cari" }));
    await waitFor(() =>
      expect(dialog.getByLabelText(/^alamat$/i)).toHaveValue("Jl. Kemang Raya No. 5"),
    );

    await user.click(dialog.getByRole("button", { name: "Batal" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Titik: -6.26, 106.81")).toBeInTheDocument();
    expect(cardAddress()).toHaveValue("Alamat lama");
  });

  it("says the map is not set up rather than hiding it", async () => {
    const user = userEvent.setup();
    mockedConfigured.mockReturnValue(false);

    render(<Harness start={{ source: "manual" }} />);
    await user.click(screen.getByRole("button", { name: /sumber alamat asal/i }));

    const option = await screen.findByRole("option", {
      name: "Pilih dari peta (belum diatur)",
    });
    expect(option).toHaveAttribute("aria-disabled", "true");
  });

  it("offers a retry rather than an empty box when Maps will not load", async () => {
    const user = userEvent.setup();
    const retry = jest.fn();
    mockedState.mockReturnValue({ state: "failed", retry });

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Pilih di peta" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/tidak bisa dimuat/i)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Gunakan titik ini" })).toBeDisabled();

    await user.click(dialog.getByRole("button", { name: "Coba lagi" }));
    expect(retry).toHaveBeenCalled();
  });
});
