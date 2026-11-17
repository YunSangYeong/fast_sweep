import { afterEach, describe, expect, it, vi } from "vitest";
import { marketKind, matchesMarket } from "../src/markets";
import { Bybit } from "../src/api";
import type { MarketFilter } from "../src/types";
afterEach(() => vi.unstubAllGlobals());
describe("Bybit market classification", () => {
  it.each([
    ["", "coin"],
    ["innovation", "coin"],
    ["stock", "stock"],
    ["commodity", "other"],
    ["forex", "other"],
    ["ETF", "other"],
    ["future-type", "other"],
    [undefined, "coin"],
  ])("classifies %s using instrument metadata", (symbolType, expected) =>
    expect(marketKind(symbolType)).toBe(expected),
  );
  it("does not classify other TradFi or unknown types as crypto", () => {
    for (const type of ["commodity", "forex", "ETF", "future-type"]) {
      expect(matchesMarket(type, "coin")).toBe(false);
      expect(matchesMarket(type, "stock")).toBe(false);
      expect(matchesMarket(type, "all")).toBe(true);
    }
  });
  it.each(["coin", "stock", "all"] as MarketFilter[])(
    "filters %s before candle requests across all pages",
    async (market) => {
      const instrument = (symbol: string, symbolType: string, extra = {}) => ({
        symbol,
        symbolType,
        status: "Trading",
        contractType: "LinearPerpetual",
        quoteCoin: "USDT",
        ...extra,
      });
      const list = [
        instrument("COINUSDT", ""),
        instrument("INNOVATIONUSDT", "innovation"),
        instrument("NVDAUSDT", "stock"),
        instrument("GOLDUSDT", "commodity"),
        instrument("EURUSDT", "forex"),
        instrument("ETFUSDT", "ETF"),
        instrument("FUTUREUSDT", "new"),
        instrument("LOWUSDT", "stock"),
        instrument("CLOSEDUSDT", "stock", { status: "Closed" }),
        instrument("BTCUSD", "", { quoteCoin: "USD" }),
        instrument("DATEDUSDT", "stock", { contractType: "LinearFutures" }),
      ];
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            retCode: 0,
            result: { list: list.slice(0, 2), nextPageCursor: "page2" },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ retCode: 0, result: { list: list.slice(2) } }),
        )
        .mockResolvedValueOnce(
          Response.json({
            retCode: 0,
            result: {
              list: list.map((i) => ({
                symbol: i.symbol,
                lastPrice: "100",
                turnover24h: i.symbol === "LOWUSDT" ? "1" : "20000000",
              })),
            },
          }),
        );
      vi.stubGlobal("fetch", fetcher);
      const result = await new Bybit().universe(
        1e7,
        new AbortController().signal,
        market,
      );
      expect(result.map((x) => x.symbol)).toEqual(
        market === "coin"
          ? ["COINUSDT", "INNOVATIONUSDT"]
          : market === "stock"
            ? ["NVDAUSDT"]
            : list.slice(0, 7).map((x) => x.symbol),
      );
      expect(fetcher.mock.calls[1][0]).toContain("cursor=page2");
    },
  );
  it("defaults to coin-only without an explicit filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            retCode: 0,
            result: {
              list: [
                {
                  symbol: "NVDAUSDT",
                  symbolType: "stock",
                  status: "Trading",
                  contractType: "LinearPerpetual",
                  quoteCoin: "USDT",
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            retCode: 0,
            result: {
              list: [
                {
                  symbol: "NVDAUSDT",
                  lastPrice: "100",
                  turnover24h: "20000000",
                },
              ],
            },
          }),
        ),
    );
    expect(
      await new Bybit().universe(1e7, new AbortController().signal),
    ).toEqual([]);
  });
});
