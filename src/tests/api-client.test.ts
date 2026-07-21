import { apiClient } from "@/services/api-client";
import { ApiError } from "@/services/api-error";

/**
 * Unit tests for the HTTP layer. fetch is mocked, so no backend is needed.
 *
 * These lock in the contract every feature module depends on: the envelope
 * is unwrapped on success, and every failure mode becomes an ApiError.
 */

const BASE = "http://localhost:5000/api";

function mockFetch(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
) {
  const status = init.status ?? 200;
  const response = {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: `HTTP ${status}`,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;

  const spy = jest.fn().mockResolvedValue(response);
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe("apiClient", () => {
  describe("success", () => {
    it("unwraps the data envelope", async () => {
      mockFetch({ success: true, data: { id: "1", name: "Salwa" } });

      const result = await apiClient.get<{ id: string; name: string }>("/x");

      expect(result).toEqual({ id: "1", name: "Salwa" });
    });

    it("prefixes the configured base URL", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.get("/health");

      expect(spy).toHaveBeenCalledWith(`${BASE}/health`, expect.anything());
    });

    it("normalizes a path with no leading slash", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.get("health");

      expect(spy).toHaveBeenCalledWith(`${BASE}/health`, expect.anything());
    });
  });

  describe("query parameters", () => {
    it("appends them to the URL", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.get("/customers", { query: { page: 2, limit: 20 } });

      expect(spy).toHaveBeenCalledWith(
        `${BASE}/customers?page=2&limit=20`,
        expect.anything(),
      );
    });

    it("drops undefined and null entries", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.get("/customers", {
        query: { page: 1, search: undefined, status: null },
      });

      expect(spy).toHaveBeenCalledWith(
        `${BASE}/customers?page=1`,
        expect.anything(),
      );
    });
  });

  describe("request body", () => {
    it("serializes JSON and sets the content type", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.post("/customers", { name: "Bella" });

      const init = spy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ name: "Bella" }));
      expect((init.headers as Headers).get("Content-Type")).toBe(
        "application/json",
      );
    });

    it("sends no body for a GET", async () => {
      const spy = mockFetch({ success: true, data: null });

      await apiClient.get("/health");

      const init = spy.mock.calls[0][1] as RequestInit;
      expect(init.body).toBeUndefined();
    });
  });

  describe("errors", () => {
    it("throws ApiError carrying the backend message and status", async () => {
      mockFetch(
        { success: false, message: "Customer not found" },
        { status: 404 },
      );

      await expect(apiClient.get("/customers/1")).rejects.toMatchObject({
        name: "ApiError",
        message: "Customer not found",
        status: 404,
      });
    });

    it("exposes validation details as field errors", async () => {
      mockFetch(
        {
          success: false,
          message: "Validation failed",
          details: [
            { field: "body.email", message: "must be a valid email" },
            { field: "body.name", message: "is required" },
          ],
        },
        { status: 400 },
      );

      const error = (await apiClient
        .post("/customers", {})
        .catch((e) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.isValidationError).toBe(true);
      // The "body." prefix is stripped so keys match form field names.
      expect(error.fieldErrors).toEqual({
        email: "must be a valid email",
        name: "is required",
      });
    });

    it("flags a 401 as unauthorized", async () => {
      mockFetch({ success: false, message: "Unauthorized" }, { status: 401 });

      const error = (await apiClient
        .get("/customers")
        .catch((e) => e)) as ApiError;

      expect(error.isUnauthorized).toBe(true);
    });

    it("converts a network failure into a network ApiError", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch")) as never;

      const error = (await apiClient
        .get("/health")
        .catch((e) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.isNetworkError).toBe(true);
      expect(error.status).toBe(0);
    });

    it("reports a non-JSON body using the HTTP status", async () => {
      mockFetch("<html>502 Bad Gateway</html>", { status: 502 });

      await expect(apiClient.get("/health")).rejects.toMatchObject({
        name: "ApiError",
        status: 502,
      });
      await expect(apiClient.get("/health")).rejects.toThrow(/non-JSON/);
    });

    it("treats an empty body as an error", async () => {
      mockFetch("", { status: 200 });

      await expect(apiClient.get("/health")).rejects.toBeInstanceOf(ApiError);
    });

    it("throws when the envelope reports failure despite a 200", async () => {
      mockFetch({ success: false, message: "Something went wrong" });

      await expect(apiClient.get("/health")).rejects.toMatchObject({
        message: "Something went wrong",
      });
    });
  });
});
