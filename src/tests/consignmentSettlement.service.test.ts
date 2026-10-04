import { consignmentSettlementService } from "@/services/consignmentSettlement.service";
import { apiClient } from "@/services/api-client";

/**
 * The consignment-settlement HTTP contract: paths, verbs, query shapes. apiClient
 * is spied on, so this asserts what the service ASKS FOR without a server.
 */
describe("consignmentSettlementService", () => {
  const get = jest.spyOn(apiClient, "get");
  const post = jest.spyOn(apiClient, "post");

  beforeEach(() => {
    get.mockReset().mockResolvedValue({} as never);
    post.mockReset().mockResolvedValue({} as never);
  });

  it("reads the outstanding per supplier, scoped by cabang", async () => {
    await consignmentSettlementService.outstanding({ branchId: "b1" });

    expect(get).toHaveBeenCalledWith("/consignment-settlements/outstanding", {
      query: { branchId: "b1" },
    });
  });

  it("sends no branchId for 'every cabang' (empty string)", async () => {
    await consignmentSettlementService.outstanding({ branchId: "" });

    expect(get).toHaveBeenCalledWith("/consignment-settlements/outstanding", {
      query: { branchId: undefined },
    });
  });

  it("lists settlements with every filter forwarded", async () => {
    await consignmentSettlementService.list({
      supplierId: "s1",
      page: 2,
      limit: 20,
    });

    expect(get).toHaveBeenCalledWith("/consignment-settlements", {
      query: { supplierId: "s1", page: 2, limit: 20 },
    });
  });

  it("creates a settlement with POST and the body untouched", async () => {
    const input = {
      supplierId: "s1",
      amount: "100000",
      method: "transfer" as const,
      channelId: "c1",
    };
    await consignmentSettlementService.create(input);

    expect(post).toHaveBeenCalledWith("/consignment-settlements", input);
  });
});
