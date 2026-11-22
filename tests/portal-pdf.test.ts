import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/c/[token]/p/[productId]/pdf/route";
import { loadPortalData, resolvePortalToken, type PortalData, type PortalTokenRow } from "@/lib/portal";
import { generateProductPdf } from "@/lib/products/pdf";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal", () => ({
  resolvePortalToken: vi.fn(),
  loadPortalData: vi.fn(),
}));
vi.mock("@/lib/products/pdf", () => ({ generateProductPdf: vi.fn() }));

const token = "portal-token-for-a-creator";
const productId = "product-authorized-for-creator";
const tokenRow = { id: "token-record" } as PortalTokenRow;
const portalProduct = {
  product: { id: productId, title: "Creator Product" },
  chapters: [{ id: "chapter-id" }],
};
const portal = {
  creator: { id: "token-creator" },
  products: [portalProduct],
} as PortalData;

function requestPdf(id = productId) {
  return GET(new Request("https://vistabix.example"), {
    params: Promise.resolve({ token, productId: id }),
  });
}

describe("creator portal PDF", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolvePortalToken).mockResolvedValue(tokenRow);
    vi.mocked(loadPortalData).mockResolvedValue(portal);
    vi.mocked(generateProductPdf).mockReturnValue(Buffer.from("%PDF-1.4\n"));
  });

  it("downloads only the selected product and marks the attachment private", async () => {
    const response = await requestPdf();

    expect(resolvePortalToken).toHaveBeenCalledWith(token);
    expect(loadPortalData).toHaveBeenCalledWith(tokenRow);
    expect(generateProductPdf).toHaveBeenCalledWith({
      product: portalProduct.product,
      creator: portal.creator,
      chapters: portalProduct.chapters,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="creator-product.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("%PDF-1.4\n");
  });

  it("returns a private 404 when the token is invalid or expired", async () => {
    vi.mocked(resolvePortalToken).mockResolvedValue(null);

    const response = await requestPdf();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(loadPortalData).not.toHaveBeenCalled();
    expect(generateProductPdf).not.toHaveBeenCalled();
  });

  it("returns a 404 when the requested product is outside the creator's review visibility", async () => {
    const response = await requestPdf("unrelated-product");

    expect(response.status).toBe(404);
    expect(generateProductPdf).not.toHaveBeenCalled();
  });
});
