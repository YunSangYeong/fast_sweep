import type { MarketFilter, MarketKind } from "./types";

// Bybit V5 symbolType enum: empty = standard crypto, innovation = crypto.
// Keep unknown/future types out of coin-only searches rather than guessing by ticker.
export function marketKind(symbolType?: string): MarketKind {
  if (
    symbolType === undefined ||
    symbolType === "" ||
    symbolType === "innovation"
  )
    return "coin";
  if (symbolType === "stock") return "stock";
  return "other";
}
export function matchesMarket(
  symbolType: string | undefined,
  filter: MarketFilter,
): boolean {
  return filter === "all" || marketKind(symbolType) === filter;
}
