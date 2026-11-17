import { matchesMarket, marketKind } from "./markets";
import { INTERVAL, type Candle, type MarketFilter } from "./types";
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const done = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const id = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(id);
      reject(new DOMException("중지됨", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
export class Bybit {
  constructor(private base = "https://api.bybit.com") {}
  async request<T>(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      let retry = false;
      try {
        const response = await fetch(
          `${this.base.replace(/\/$/, "")}/v5/market/${path}?${new URLSearchParams({ category: "linear", ...params })}`,
          { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) },
        );
        if (response.status === 429 || response.status >= 500) retry = true;
        else if (!response.ok)
          throw Error(
            `HTTP ${response.status}: API 접근/CORS 또는 지역 제한을 확인하세요`,
          );
        else {
          const body = await response.json();
          if (body.retCode === 0) return body.result as T;
          if (body.retCode === 10006) retry = true;
          else throw Error(`Bybit ${body.retCode}: ${body.retMsg}`);
        }
      } catch (e) {
        if (signal.aborted) throw e;
        if (
          e instanceof TypeError ||
          (e instanceof DOMException && e.name === "TimeoutError")
        )
          retry = true;
        else throw e;
      }
      if (retry && attempt < 3)
        await wait(700 * 2 ** attempt + Math.random() * 300, signal);
    }
    throw Error(
      "API 요청 실패: 재시도 한도 초과 (네트워크/CORS/호출 제한 확인)",
    );
  }
  async universe(
    min: number,
    signal: AbortSignal,
    market: MarketFilter = "coin",
  ) {
    const instruments: {
      symbol: string;
      status: string;
      contractType: string;
      quoteCoin: string;
      symbolType?: string;
    }[] = [];
    let cursor = "";
    const seen = new Set<string>();
    do {
      const page = await this.request<{
        list: typeof instruments;
        nextPageCursor?: string;
      }>(
        "instruments-info",
        { limit: "1000", ...(cursor ? { cursor } : {}) },
        signal,
      );
      instruments.push(...page.list);
      cursor = page.nextPageCursor ?? "";
      if (cursor && seen.has(cursor)) throw Error("API 페이지네이션 커서 반복");
      seen.add(cursor);
    } while (cursor);
    const tickers = await this.request<{
      list: { symbol: string; lastPrice: string; turnover24h: string }[];
    }>("tickers", {}, signal);
    const allowed = new Map(
      instruments
        .filter(
          (x) =>
            x.status === "Trading" &&
            x.contractType === "LinearPerpetual" &&
            x.quoteCoin === "USDT" &&
            matchesMarket(x.symbolType, market),
        )
        .map((x) => [x.symbol, marketKind(x.symbolType)] as const),
    );
    return tickers.list
      .filter(
        (x) =>
          allowed.has(x.symbol) &&
          Number(x.turnover24h) >= min &&
          Number(x.lastPrice) > 0,
      )
      .map((x) => ({
        symbol: x.symbol,
        market: allowed.get(x.symbol)!,
        price: Number(x.lastPrice),
        turnover: Number(x.turnover24h),
      }));
  }
  async candles(
    symbol: string,
    asOf: number,
    signal: AbortSignal,
  ): Promise<Candle[]> {
    const result = await this.request<{ list: string[][] }>(
      "kline",
      {
        symbol,
        interval: "15",
        limit: "250",
        end: String(Math.floor(asOf / INTERVAL) * INTERVAL - 1),
      },
      signal,
    );
    return result.list.map((v) => ({
      time: Number(v[0]),
      open: Number(v[1]),
      high: Number(v[2]),
      low: Number(v[3]),
      close: Number(v[4]),
      volume: Number(v[5]),
    }));
  }
}
