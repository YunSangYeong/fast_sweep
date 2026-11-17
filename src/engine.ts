import { atr, pivots } from "./indicators";
import { INTERVAL, type Candle, type Signal, type Plan } from "./types";
export function closedCandles(input: Candle[], now: number): Candle[] {
  const sorted = [...input]
    .sort((a, b) => a.time - b.time)
    .filter((b) => b.time + INTERVAL <= now);
  sorted.forEach((b, i) => {
    if (
      !Object.values(b).every(Number.isFinite) ||
      b.volume < 0 ||
      b.low <= 0 ||
      b.low > Math.min(b.open, b.close) ||
      b.high < Math.max(b.open, b.close) ||
      b.time % INTERVAL !== 0
    )
      throw Error("잘못된 OHLC 데이터");
    if (i && b.time - sorted[i - 1].time !== INTERVAL)
      throw Error("캔들 누락 또는 중복");
  });
  if (sorted.length < 64) throw Error("과거 캔들 부족 (최소 64봉)");
  if (sorted.at(-1)!.time !== Math.floor(now / INTERVAL) * INTERVAL - INTERVAL)
    throw Error("최신 확정 캔들 누락");
  return sorted;
}
export function tradePlan(
  direction: "LONG" | "SHORT",
  low: number,
  high: number,
  extreme: number,
  a: number,
  price: number,
): Plan {
  const entry = (low + high) / 2,
    stop = extreme + (direction === "LONG" ? -1 : 1) * a * 0.2;
  const risk = direction === "LONG" ? entry - stop : stop - entry;
  const target = entry + (direction === "LONG" ? 1 : -1) * risk * 2;
  return {
    entry,
    stop,
    target,
    valid: risk > 0 && stop > 0 && target > 0,
    passed:
      direction === "LONG"
        ? price <= stop || price >= target
        : price >= stop || price <= target,
  };
}
export function detect(
  input: Candle[],
  symbol: string,
  price: number,
  turnover: number,
  now: number,
  recent = 10,
): Signal[] {
  const c = closedCandles(input, now),
    a = atr(c),
    p = pivots(c, 3),
    short = pivots(c, 2),
    results: Signal[] = [];
  // Each event uses only pivots already confirmed strictly before its sweep.
  for (let s = Math.max(50, c.length - recent - 20); s < c.length; s++)
    for (const direction of ["LONG", "SHORT"] as const) {
      const long = direction === "LONG",
        kind = long ? "low" : "high";
      const eligible = p.filter(
        (v) => v.kind === kind && v.confirmed < s && v.index >= s - 50,
      );
      const crossed = eligible.filter((v) =>
        long
          ? c[s].low < v.price && c[s - 1].close >= v.price
          : c[s].high > v.price && c[s - 1].close <= v.price,
      );
      // One directional event per candle, using the most recently confirmed swept pivot.
      const pivot = crossed.at(-1);
      if (!pivot || !a[s - 1]) continue;
      const limit = Math.min(s + 3, c.length - 1);
      let reclaim = -1,
        extreme = long ? c[s].low : c[s].high;
      for (let j = s; j <= limit; j++) {
        extreme = long
          ? Math.min(extreme, c[j].low)
          : Math.max(extreme, c[j].high);
        if (long ? c[j].close > pivot.price : c[j].close < pivot.price) {
          reclaim = j;
          break;
        }
      }
      const depth = Math.abs(extreme - pivot.price) / a[s - 1];
      if (reclaim < 0 || depth < 0.1 || depth > 1.5) continue;
      if (
        results.some(
          (r) =>
            r.direction === direction &&
            r.level === pivot.price &&
            s <= r.reclaim,
        )
      )
        continue;
      const volumes = c.slice(s - 20, s).map((v) => v.volume),
        mean = volumes.reduce((x, y) => x + y, 0) / 20,
        sd = Math.sqrt(volumes.reduce((x, y) => x + (y - mean) ** 2, 0) / 20);
      const ratio = mean ? c[s].volume / mean : 0,
        z = sd ? (c[s].volume - mean) / sd : 0;
      const equal = eligible.some(
        (v) =>
          v.index !== pivot.index &&
          Math.abs(v.price - pivot.price) <= a[s - 1] * 0.2,
      );
      const opposite = short
        .filter(
          (v) =>
            v.kind === (long ? "high" : "low") &&
            v.confirmed < s &&
            v.index >= s - 50,
        )
        .at(-1);
      let mss: number | undefined;
      if (opposite)
        for (
          let j = Math.max(s + 1, reclaim);
          j <= Math.min(s + 8, c.length - 1);
          j++
        )
          if (
            long ? c[j].close > opposite.price : c[j].close < opposite.price
          ) {
            mss = j;
            break;
          }
      let gap: Signal["gap"];
      if (mss !== undefined)
        for (let j = s + 2; j <= Math.min(mss + 3, s + 20, c.length - 1); j++) {
          const low = long ? c[j - 2].high : c[j].high,
            high = long ? c[j].low : c[j - 2].low;
          if (high - low >= a[j] * 0.15) {
            gap = { low, high, index: j };
            break;
          }
        }
      if (gap && mss !== undefined)
        for (
          let j = Math.max(gap.index, mss) + 1;
          j <= Math.min(s + 20, c.length - 1);
          j++
        )
          if (c[j].low <= gap.high && c[j].high >= gap.low) {
            gap.retest = j;
            break;
          }
      const stage =
        gap?.retest !== undefined ? 4 : gap ? 3 : mss !== undefined ? 2 : 1;
      const transition =
        gap?.retest ?? (gap ? Math.max(gap.index, mss!) : (mss ?? reclaim));
      if (c.length - 1 - transition >= recent) continue;
      const score =
        25 +
        (ratio >= 1.5 ? 15 : ratio >= 1.2 ? 8 : 0) +
        (equal ? 10 : 0) +
        (mss !== undefined ? 25 : 0) +
        (gap ? 15 : 0) +
        (gap?.retest !== undefined ? 10 : 0);
      results.push({
        id: `${symbol}-${direction}-${c[s].time}`,
        symbol,
        direction,
        sweep: s,
        reclaim,
        level: pivot.price,
        extreme,
        atr: a[s - 1],
        mss,
        gap,
        stage,
        transition,
        score,
        equal,
        volumeRatio: ratio,
        zScore: z,
        plan: gap
          ? tradePlan(direction, gap.low, gap.high, extreme, a[s - 1], price)
          : undefined,
        candles: c,
        pivots: p,
        price,
        turnover,
      });
    }
  return results;
}
