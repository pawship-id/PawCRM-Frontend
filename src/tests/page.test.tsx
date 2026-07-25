import Home from "@/app/page";

const redirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

/**
 * The root route is now a bare redirect to /login (no landing UI yet). This
 * also keeps the smoke coverage that next/jest, the SWC transform and the @/
 * alias are wired up.
 */
describe("Home page", () => {
  beforeEach(() => redirect.mockClear());

  it("redirects to the login route", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
