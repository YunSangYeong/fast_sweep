import type { Candle, Pivot } from "./types";
export function atr(c: Candle[], period = 14): number[] {
  const out: number[] = [];
  let value = 0;
  c.forEach((b, i) => {
    const tr = i
      ? Math.max(
          b.high - b.low,
          Math.abs(b.high - c[i - 1].close),
          Math.abs(b.low - c[i - 1].close),
        )
      : b.high - b.low;
    if (i < period) {
      value += tr;
      out.push(i === period - 1 ? value / period : NaN);
      if (i === period - 1) value /= period;
    } else {
      value = (value * (period - 1) + tr) / period;
      out.push(value);
    }
  });
  return out;
}
export function pivots(c: Candle[], width: number): Pivot[] {
  const out: Pivot[] = [];
  for (let i = width; i < c.length - width; i++)
    for (const kind of ["high", "low"] as const) {
      const price = c[i][kind];
      const around = c
        .slice(i - width, i + width + 1)
        .filter((_, j) => j !== width);
      if (
        around.every((b) => (kind === "high" ? b.high < price : b.low > price))
      )
        out.push({ index: i, price, kind, confirmed: i + width });
    }
  return out;
}
