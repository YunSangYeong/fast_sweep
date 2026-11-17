import type { Signal } from "./types";

type Candidate = Pick<
  Signal,
  "symbol" | "candles" | "transition" | "sweep" | "score" | "id"
>;

/** Choose one matching event per symbol independently of the display sort order. */
export function onePerSymbol<T extends Candidate>(signals: readonly T[]): T[] {
  const ranked = [...signals].sort(
    (a, b) =>
      b.candles[b.transition].time - a.candles[a.transition].time ||
      b.score - a.score ||
      b.candles[b.sweep].time - a.candles[a.sweep].time ||
      a.id.localeCompare(b.id),
  );
  const selected = new Map<string, T>();
  for (const signal of ranked) {
    if (!selected.has(signal.symbol)) selected.set(signal.symbol, signal);
  }
  return [...selected.values()];
}
