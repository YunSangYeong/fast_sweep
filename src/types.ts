export type MarketFilter = "coin" | "stock" | "all";
export type MarketKind = "coin" | "stock" | "other";
export const INTERVAL = 900_000;
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
  confirmed: number;
}
export interface Gap {
  low: number;
  high: number;
  index: number;
  retest?: number;
}
export interface Plan {
  entry: number;
  stop: number;
  target: number;
  valid: boolean;
  passed: boolean;
}
export interface Signal {
  market?: MarketKind;
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  sweep: number;
  reclaim: number;
  level: number;
  extreme: number;
  atr: number;
  mss?: number;
  gap?: Gap;
  stage: 1 | 2 | 3 | 4;
  transition: number;
  score: number;
  equal: boolean;
  volumeRatio: number;
  zScore: number;
  plan?: Plan;
  candles: Candle[];
  pivots: Pivot[];
  price: number;
  turnover: number;
}
