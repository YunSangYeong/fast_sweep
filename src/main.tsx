import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bybit } from "./api";
import { detect } from "./engine";
import type { Signal } from "./types";
import Chart from "./Chart";
import "./style.css";
const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumSignificantDigits: 8 });
const date = (n: number) =>
  new Date(n).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
function App() {
  const [direction, D] = useState("ALL"),
    [min, M] = useState(0),
    [recent, R] = useState(10),
    [volume, V] = useState(false),
    [turn, T] = useState(10000000),
    [sort, S] = useState("score"),
    [base, B] = useState(
      localStorage.getItem("bybit-base") || "https://api.bybit.com",
    );
  const [signals, setSignals] = useState<Signal[]>([]),
    [busy, setBusy] = useState(false),
    [total, setTotal] = useState<number | null>(null),
    [done, setDone] = useState(0),
    [errors, setErrors] = useState<string[]>([]),
    [status, setStatus] = useState("대기"),
    [asOf, A] = useState(0),
    [finished, F] = useState(false);
  const controller = useRef<AbortController | null>(null);
  async function scan() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setSignals([]);
    setErrors([]);
    setDone(0);
    setTotal(null);
    F(false);
    setStatus("대상 종목 수집 중");
    const at = Date.now();
    A(at);
    try {
      const api = new Bybit(base);
      localStorage.setItem("bybit-base", base);
      const universe = await api.universe(turn, abort.signal);
      setTotal(universe.length);
      setStatus("15분봉 검색 중");
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (cursor < universe.length && !abort.signal.aborted) {
            const item = universe[cursor++];
            try {
              const candles = await api.candles(item.symbol, at, abort.signal);
              const found = detect(
                candles,
                item.symbol,
                item.price,
                item.turnover,
                at,
                30,
              );
              setSignals((old) => [...old, ...found]);
            } catch (e) {
              if (abort.signal.aborted) break;
              setErrors((old) => [...old, `${item.symbol}: ${String(e)}`]);
            }
            setDone((n) => n + 1);
            await new Promise((resolve) => setTimeout(resolve, 180));
          }
        }),
      );
      if (abort.signal.aborted) setStatus("검색 중지됨 · 부분 결과");
      else {
        setStatus("검색 완료");
        F(true);
      }
    } catch (e) {
      setStatus(abort.signal.aborted ? "검색 중지됨" : "API 연결 실패");
      if (!abort.signal.aborted) setErrors([String(e)]);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  const filtered = signals
    .filter(
      (s) =>
        (direction === "ALL" || s.direction === direction) &&
        s.score >= min &&
        (!volume || s.volumeRatio >= 1.5) &&
        s.candles.length - 1 - s.transition < recent,
    )
    .sort((a, b) =>
      sort === "score"
        ? b.score - a.score
        : sort === "latest"
          ? b.candles[b.transition].time - a.candles[a.transition].time
          : b.turnover - a.turnover,
    );
  return (
    <main>
      <header>
        <div className="eyebrow">BYBIT LINEAR · USDT PERPETUALS</div>
        <h1>
          Liquidity Sweep <span>Precision Scanner</span>
          <small>V1.0</small>
        </h1>
        <p>유동성 회수에서 구조 전환까지, 확정된 15분봉으로 탐색합니다.</p>
      </header>
      <section className="panel">
        <div className="sectiontitle">
          검색 조건 <span>15m · KST</span>
        </div>
        <div className="options">
          <label>
            방향
            <select value={direction} onChange={(e) => D(e.target.value)}>
              <option>ALL</option>
              <option>LONG</option>
              <option>SHORT</option>
            </select>
          </label>
          <label>
            최소 점수
            <input
              type="number"
              min="0"
              max="100"
              value={min}
              onChange={(e) => M(Math.min(100, Math.max(0, +e.target.value)))}
            />
          </label>
          <label>
            최근 유효 단계
            <select value={recent} onChange={(e) => R(+e.target.value)}>
              {[5, 10, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n}봉
                </option>
              ))}
            </select>
          </label>
          <label>
            최소 거래대금 (USDT)
            <input
              disabled={busy}
              type="number"
              min="10000000"
              step="1000000"
              value={turn}
              onChange={(e) => T(Math.max(10000000, +e.target.value))}
            />
          </label>
          <label>
            정렬
            <select value={sort} onChange={(e) => S(e.target.value)}>
              <option value="score">점수순</option>
              <option value="latest">최신 신호순</option>
              <option value="turnover">거래대금순</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={volume}
              onChange={(e) => V(e.target.checked)}
            />{" "}
            거래량 1.5배 필터
          </label>
        </div>
        <details>
          <summary>API 연결 설정</summary>
          <label>
            Bybit API 또는 선택형 Worker URL
            <input
              disabled={busy}
              type="url"
              value={base}
              onChange={(e) => B(e.target.value)}
            />
          </label>
          <p>
            직접 연결이 CORS·지역 제한으로 실패하면 README의 프록시 배포 안내를
            따르세요.
          </p>
        </details>
        <div className="actions">
          <button disabled={busy} onClick={scan}>
            {busy ? "검색 중…" : finished ? "다시 검색" : "전체 시장 검색 시작"}{" "}
            <span>↗</span>
          </button>
          {busy && (
            <button
              className="stop"
              onClick={() => controller.current?.abort()}
            >
              검색 중지
            </button>
          )}
        </div>
      </section>
      <section className="stats">
        {[
          ["대상 종목", total ?? "—"],
          ["검색 완료", done],
          ["롱 후보", filtered.filter((s) => s.direction === "LONG").length],
          ["숏 후보", filtered.filter((s) => s.direction === "SHORT").length],
          ["STAGE 4", filtered.filter((s) => s.stage === 4).length],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <div
        className="progress"
        role="progressbar"
        aria-label="검색 진행률"
        aria-valuenow={total ? (done / total) * 100 : 0}
      >
        <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="status">
        <span>
          {status} {total !== null && `${done}/${total}`}
        </span>
        <span>
          {asOf
            ? `데이터 기준 ${date(Math.floor(asOf / 900000) * 900000)} KST`
            : "확정 봉만 사용"}
        </span>
      </div>
      {errors.length > 0 && (
        <details className="error" open>
          <summary>
            요청 실패 {errors.length}건 · 실패는 신호 없음과 다릅니다
          </summary>
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
      <div className="sectiontitle results">
        탐색 결과 <span>{filtered.length} SIGNALS</span>
      </div>
      {!filtered.length && (
        <section className="empty">
          <div>⌁</div>
          <h2>
            {busy
              ? "시장을 살펴보고 있습니다"
              : finished && errors.length === 0
                ? "조건을 충족하는 종목이 없습니다"
                : errors.length
                  ? "데이터 수집 오류를 확인하세요"
                  : "다음 스윕을 찾아보세요"}
          </h2>
          <p>
            {!finished
              ? "검색을 시작하면 실제 Bybit 데이터로 후보를 계산합니다."
              : "검색 조건과 수집 상태를 확인하세요."}
          </p>
        </section>
      )}
      <div className="cards">
        {filtered.map((s) => (
          <article
            key={s.id}
            className={s.direction === "LONG" ? "long" : "short"}
          >
            <div className="cardhead">
              <div>
                <h2>
                  {s.symbol} <em>{s.direction}</em>
                </h2>
                <span>
                  STAGE {s.stage} ·{" "}
                  {
                    ["", "SWEEP", "MSS CONFIRMED", "FVG READY", "ENTRY WATCH"][
                      s.stage
                    ]
                  }
                </span>
              </div>
              <strong>
                {s.score}
                <small>/100</small>
              </strong>
            </div>
            <div className="price">
              {fmt(s.price)}{" "}
              <span>24h {(s.turnover / 1e6).toFixed(1)}M USDT</span>
            </div>
            <Chart signal={s} />
            <div className="metrics">
              <div>
                진입 후보
                <strong>{s.plan?.valid ? fmt(s.plan.entry) : "—"}</strong>
              </div>
              <div>
                손절<strong>{s.plan?.valid ? fmt(s.plan.stop) : "—"}</strong>
              </div>
              <div>
                목표 · RR 1:2
                <strong>{s.plan?.valid ? fmt(s.plan.target) : "—"}</strong>
              </div>
            </div>
            <p className="planstatus">
              {!s.plan
                ? "FVG 대기 · 거래 계획 없음"
                : !s.plan.valid
                  ? "유효하지 않은 거래 계획"
                  : s.plan.passed
                    ? "진입 기회 경과 · 현재가가 SL/TP 통과"
                    : "지정가 참고 수준 · 체결을 의미하지 않음"}
            </p>
            <details>
              <summary>신호 상세 보기</summary>
              <dl>
                {[
                  ["스윕 시각", date(s.candles[s.sweep].time)],
                  ["스윕 기준 / 극값", `${fmt(s.level)} / ${fmt(s.extreme)}`],
                  ["복귀 확인", date(s.candles[s.reclaim].time)],
                  [
                    "최근 단계 확정",
                    date(s.candles[s.transition].time + 900000),
                  ],
                  [
                    "MSS",
                    s.mss === undefined
                      ? "미확인"
                      : date(s.candles[s.mss].time + 900000),
                  ],
                  [
                    "FVG 하단 / 상단",
                    s.gap ? `${fmt(s.gap.low)} / ${fmt(s.gap.high)}` : "없음",
                  ],
                  [
                    "거래량 / Z-score",
                    `${s.volumeRatio.toFixed(2)}× / ${s.zScore.toFixed(2)}`,
                  ],
                  ["Equal Highs / Lows", s.equal ? "확인" : "미확인"],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </details>
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://www.tradingview.com/chart/?symbol=BYBIT%3A${s.symbol}.P&interval=15`}
            >
              TradingView에서 보기 ↗
            </a>
          </article>
        ))}
      </div>
      <footer>
        점수는 규칙 충족도이며 통계적 승률이 아닙니다. 수동매매 지원용 탐색기로
        자동 주문을 실행하지 않습니다.
        <br />
        TradingView Lightweight Charts™ ·{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView
        </a>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
