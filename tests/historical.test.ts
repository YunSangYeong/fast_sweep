import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { detect } from "../src/engine";
import { INTERVAL, type Candle } from "../src/types";
// Supply your own unmodified historical 15m OHLCV export; never substitute synthetic data here.
const path = process.env.HISTORICAL_CANDLES;
it.skipIf(!path)(
  "replays supplied historical candles one closed bar at a time without lookahead",
  () => {
    const candles = JSON.parse(readFileSync(path!, "utf8")) as Candle[];
    expect(candles.length).toBeGreaterThanOrEqual(100);
    const observed = new Map<
      string,
      { sweep: number; reclaim: number; level: number; mss?: number }
    >();
    for (let n = 64; n <= candles.length; n++) {
      const prefix = candles.slice(0, n);
      const signals = detect(
        prefix,
        "REPLAY",
        prefix[n - 1].close,
        0,
        prefix[n - 1].time + INTERVAL,
        30,
      );
      for (const s of signals) {
        expect(s.transition).toBeLessThan(n);
        expect(s.transition - s.sweep).toBeLessThanOrEqual(20);
        const past = observed.get(s.id);
        if (past) {
          expect(s.level).toBe(past.level);
          expect(s.reclaim).toBe(past.reclaim);
          if (past.mss !== undefined) expect(s.mss).toBe(past.mss);
        }
        observed.set(s.id, {
          sweep: s.sweep,
          reclaim: s.reclaim,
          level: s.level,
          mss: s.mss,
        });
      }
    }
    console.info(
      `Historical replay: ${candles.length} candles, ${observed.size} distinct events. No win-rate calculation.`,
    );
  },
);
