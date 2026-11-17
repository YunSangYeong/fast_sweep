import { describe, expect, it } from "vitest";
import { onePerSymbol } from "../src/results";
const candles = Array.from({ length: 5 }, (_, i) => ({
  time: i * 900000,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 100,
}));
const signal = (
  id: string,
  symbol: string,
  transition: number,
  score: number,
  sweep = 0,
  direction = "LONG",
) => ({ id, symbol, transition, score, sweep, direction, candles });
describe("one result card per symbol", () => {
  it("chooses the latest transition even when an older event has a higher score", () => {
    const old = signal("old", "BTCUSDT", 2, 100),
      recent = signal("recent", "BTCUSDT", 3, 40);
    expect(onePerSymbol([old, recent])).toEqual([recent]);
  });
  it("uses score to break equal transition timestamps", () => {
    const low = signal("low", "BTCUSDT", 3, 40),
      high = signal("high", "BTCUSDT", 3, 90);
    expect(onePerSymbol([low, high])).toEqual([high]);
  });
  it("collapses opposing directions for the same symbol in ALL", () => {
    const long = signal("long", "BTCUSDT", 2, 100),
      short = signal("short", "BTCUSDT", 3, 40, 0, "SHORT");
    expect(onePerSymbol([long, short])).toEqual([short]);
    expect(
      onePerSymbol([long, short].filter((s) => s.direction === "LONG")),
    ).toEqual([long]);
  });
  it("keeps different symbols and does not mutate or depend on input order", () => {
    const a = signal("a", "BTCUSDT", 2, 80),
      b = signal("b", "BTCUSDT", 3, 40),
      c = signal("c", "ETHUSDT", 2, 80);
    const input = [a, b, c];
    expect(onePerSymbol(input)).toEqual([b, c]);
    expect(onePerSymbol([...input].reverse())).toEqual([b, c]);
    expect(input).toEqual([a, b, c]);
  });
  it("has a deterministic tie breaker and handles empty results", () => {
    const a = signal("a", "BTCUSDT", 3, 80),
      b = signal("b", "BTCUSDT", 3, 80);
    expect(onePerSymbol([b, a])).toEqual([a]);
    expect(onePerSymbol([])).toEqual([]);
  });
});
