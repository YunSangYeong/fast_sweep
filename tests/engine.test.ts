import { describe, it, expect, vi, afterEach } from "vitest";
import { detect, closedCandles, tradePlan } from "../src/engine";
import { pivots } from "../src/indicators";
import { Bybit } from "../src/api";
import { INTERVAL, type Candle } from "../src/types";
const start = 1800000000000;
function fixture() {
  const c: Candle[] = Array.from({ length: 85 }, (_, i) => ({
    time: start + i * INTERVAL,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
  }));
  c[55].low = 95;
  c[60].high = 104;
  c[70] = { ...c[70], low: 94, volume: 200 };
  c[71] = { ...c[71], open: 100, high: 106, low: 100, close: 105 };
  c[72] = { ...c[72], open: 104, high: 106, low: 102, close: 105 };
  c[73] = { ...c[73], open: 103, high: 105, low: 101.5, close: 104 };
  return c;
}
const run = (c: Candle[], n = c.length) =>
  detect(c.slice(0, n), "TESTUSDT", 100, 2e7, start + n * INTERVAL, 30);
const event = (c: Candle[], n = c.length) =>
  run(c, n).find((s) => s.sweep === 70);
const mirror = (c: Candle[]) =>
  c.map((b) => ({
    ...b,
    open: 200 - b.open,
    close: 200 - b.close,
    high: 200 - b.low,
    low: 200 - b.high,
  }));
describe("causal sweep lifecycle", () => {
  it("detects reclaimed bullish sweep", () =>
    expect(event(fixture())?.direction).toBe("LONG"));
  it("detects reclaimed bearish sweep", () =>
    expect(event(mirror(fixture()))?.direction).toBe("SHORT"));
  it.each(["LONG", "SHORT"])("excludes continued breakout %s", (direction) => {
    let c = fixture();
    for (let i = 70; i < 74; i++)
      c[i] = { ...c[i], open: 94, high: 94.5, low: 93, close: 94 };
    if (direction === "SHORT") c = mirror(c);
    expect(event(c)).toBeUndefined();
  });
  it("excludes a live candle", () => {
    const c = fixture().slice(0, 71);
    expect(
      detect(c, "X", 100, 2e7, start + 70 * INTERVAL + 1, 30).some(
        (s) => s.sweep === 70,
      ),
    ).toBe(false);
  });
  it("does not backdate a future-confirmed pivot", () => {
    const c = fixture();
    c[69].low = 93;
    expect(pivots(c, 3).filter((p) => p.index === 69)).toHaveLength(1);
    expect(
      pivots(c, 3)
        .filter((p) => p.index === 69)
        .every((p) => p.confirmed === 72),
    ).toBe(true);
    expect(event(c)?.level).toBe(95);
  });
  it("transitions to MSS by close", () => {
    const s = event(fixture(), 72);
    expect(s?.mss).toBe(71);
    expect(s?.stage).toBe(2);
  });
  it("does not allow FVG alone to promote stage", () => {
    const c = fixture();
    c[60].high = 110;
    expect(event(c, 74)?.stage).toBe(1);
    expect(event(c, 74)?.gap).toBeUndefined();
  });
  it("transitions FVG then retest only on subsequent candles", () => {
    expect(event(fixture(), 73)?.stage).toBe(3);
    expect(event(fixture(), 74)?.stage).toBe(4);
    expect(event(fixture(), 74)?.gap?.retest).toBe(73);
  });
  it("creates no duplicate ids", () => {
    const all = run(fixture());
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(
      all.filter((s) => s.sweep === 70 && s.direction === "LONG"),
    ).toHaveLength(1);
  });
  it("rejects missing, duplicate and insufficient data", () => {
    const c = fixture();
    expect(() => run(c.filter((_, i) => i !== 20))).toThrow("누락");
    expect(() => run([...c, c[30]])).toThrow("중복");
    expect(() => closedCandles(c.slice(0, 20), Infinity)).toThrow("부족");
  });
  it("replays every prefix without changing previously confirmed event facts", () => {
    const c = fixture();
    for (let n = 80; n <= c.length; n++) {
      const s = event(c, n)!;
      expect(s.sweep).toBe(70);
      expect(s.mss).toBe(71);
      expect(s.gap?.index).toBe(72);
      expect(s.transition).toBe(73);
    }
    expect(event(c, 71)?.stage).toBe(1);
  });
  it("filters by latest transition rather than sweep age", () => {
    const c = fixture();
    expect(
      detect(c, "X", 100, 2e7, start + 85 * INTERVAL, 10).some(
        (s) => s.sweep === 70,
      ),
    ).toBe(false);
    expect(
      detect(c, "X", 100, 2e7, start + 85 * INTERVAL, 20).some(
        (s) => s.sweep === 70,
      ),
    ).toBe(true);
  });
  it.each(["LONG", "SHORT"] as const)("calculates exact 1:2 RR %s", (dir) => {
    const p = tradePlan(dir, 100, 102, dir === "LONG" ? 95 : 106, 5, 101);
    expect(p.valid).toBe(true);
    expect(Math.abs(p.target - p.entry)).toBe(2 * Math.abs(p.entry - p.stop));
    expect(p.passed).toBe(false);
  });
  it("rejects a missing latest closed candle", () => {
    const c = fixture();
    expect(() =>
      detect(c.slice(0, -1), "X", 100, 2e7, start + c.length * INTERVAL, 30),
    ).toThrow("최신 확정 캔들 누락");
  });
  it("does not accept retests more than 20 bars after a sweep", () => {
    const c = fixture();
    for (let i = 73; i < 100; i++)
      c[i] = {
        time: start + i * INTERVAL,
        open: 100,
        high: 100.5,
        low: 99,
        close: 100,
        volume: 100,
      };
    c[91] = { ...c[91], open: 103, high: 105, low: 101.5, close: 104 };
    expect(event(c)?.stage).toBe(3);
    expect(event(c)?.gap?.retest).toBeUndefined();
  });
  it("scores components once and leaves initial sweeps without a plan", () => {
    expect(event(fixture())?.score).toBe(90);
    expect(event(fixture(), 71)?.score).toBe(40);
    expect(event(fixture(), 71)?.plan).toBeUndefined();
  });

  it("rejects invalid plans and flags passed price", () => {
    expect(tradePlan("LONG", 100, 102, 110, 1, 101).valid).toBe(false);
    expect(tradePlan("SHORT", 100, 102, 106, 1, 90).passed).toBe(true);
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("Bybit transport", () => {
  it("surfaces HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })),
    );
    await expect(
      new Bybit().universe(1e7, new AbortController().signal),
    ).rejects.toThrow("403");
  });
  it("paginates instruments and filters all eligible markets", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          retCode: 0,
          result: {
            list: [
              {
                symbol: "A",
                status: "Trading",
                contractType: "LinearPerpetual",
                quoteCoin: "USDT",
              },
            ],
            nextPageCursor: "next",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          retCode: 0,
          result: {
            list: [
              {
                symbol: "B",
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
              { symbol: "A", lastPrice: "100", turnover24h: "20000000" },
              { symbol: "B", lastPrice: "10", turnover24h: "30000000" },
              { symbol: "C", lastPrice: "1", turnover24h: "30000000" },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await new Bybit().universe(1e7, new AbortController().signal),
    ).toHaveLength(2);
    expect(fetcher.mock.calls[1][0]).toContain("cursor=next");
  });
  it("cancels before requests", async () => {
    const a = new AbortController();
    a.abort();
    await expect(new Bybit().universe(1e7, a.signal)).rejects.toThrow();
  });
});
