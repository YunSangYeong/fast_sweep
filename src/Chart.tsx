import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  LineStyle,
  type UTCTimestamp,
  type AutoscaleInfo,
  type Time,
} from "lightweight-charts";
import type { Signal } from "./types";
export default function Chart({ signal: s }: { signal: Signal }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !host.current) return;
    const el = host.current;
    const chart = createChart(el, {
      autoSize: true,
      height: 300,
      layout: { background: { color: "#0d1421" }, textColor: "#a9b8cd" },
      grid: {
        vertLines: { color: "#182235" },
        horzLines: { color: "#182235" },
      },
      timeScale: { timeVisible: true, tickMarkFormatter: (t: Time) => typeof t === "number" ? new Date(t*1000).toLocaleTimeString("ko-KR", {timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}) : "" },
      localization: {
        timeFormatter: (t: number) =>
          new Date(t * 1000).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          }),
      },
    });
    const precision = Math.min(
      8,
      Math.max(2, 4 - Math.floor(Math.log10(s.price))),
    );
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      borderVisible: false,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (info?.priceRange && s.plan?.valid) {
          info.priceRange.minValue = Math.min(
            info.priceRange.minValue,
            s.plan.stop,
            s.plan.target,
          );
          info.priceRange.maxValue = Math.max(
            info.priceRange.maxValue,
            s.plan.stop,
            s.plan.target,
          );
        }
        return info;
      },
    });
    const data = s.candles.slice(-100);
    series.setData(
      data.map((c) => ({ ...c, time: (c.time / 1000) as UTCTimestamp })),
    );
    const color = s.direction === "LONG" ? "#34d399" : "#fb7185";
    const line = (price: number, title: string, c = color) =>
      series.createPriceLine({
        price,
        color: c,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
    line(s.level, "SWEEP");
    if (s.plan?.valid) {
      line(s.plan.entry, "진입");
      line(s.plan.stop, "SL", "#fb7185");
      line(s.plan.target, "TP", "#60a5fa");
    }
    const markers = [
      { index: s.sweep, text: "SWEEP" },
      ...(s.mss === undefined ? [] : [{ index: s.mss, text: "MSS" }]),
    ]
      .filter((m) => m.index >= s.candles.length - 100)
      .map((m) => ({
        time: (s.candles[m.index].time / 1000) as UTCTimestamp,
        position: s.direction === "LONG" ? "belowBar" as const : "aboveBar" as const,
        color,
        shape: s.direction === "LONG" ? "arrowUp" as const : "arrowDown" as const,
        text: m.text,
      }));
    createSeriesMarkers(series, markers);
    chart.timeScale().fitContent();
    const canvas = document.createElement("canvas");
    canvas.className = "overlay";
    el.appendChild(canvas);
    const draw = () => {
      const ratio = devicePixelRatio || 1;
      canvas.width = el.clientWidth * ratio;
      canvas.height = 300 * ratio;
      canvas.style.width = el.clientWidth + "px";
      canvas.style.height = "300px";
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      if (s.gap) {
        const x = chart
            .timeScale()
            .timeToCoordinate(
              (s.candles[s.gap.index].time / 1000) as UTCTimestamp,
            ),
          top = series.priceToCoordinate(s.gap.high),
          bottom = series.priceToCoordinate(s.gap.low);
        if (x !== null && top !== null && bottom !== null) {
          ctx.fillStyle = s.direction === "LONG" ? "#34d39930" : "#fb718530";
          ctx.fillRect(
            Math.max(0, x),
            top,
            chart.timeScale().width() - Math.max(0, x),
            bottom - top,
          );
        }
      }
      ctx.fillStyle = "#7184a0";
      for (const p of s.pivots.filter(
        (p) => p.index >= s.candles.length - 100,
      )) {
        const x = chart
            .timeScale()
            .timeToCoordinate((s.candles[p.index].time / 1000) as UTCTimestamp),
          y = series.priceToCoordinate(p.price);
        if (x !== null && y !== null) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
    el.addEventListener("wheel", draw);
    el.addEventListener("pointermove", draw);
    const resize = new ResizeObserver(draw);
    resize.observe(el);
    draw();
    return () => {
      resize.disconnect();
      el.removeEventListener("wheel", draw);
      el.removeEventListener("pointermove", draw);
      canvas.remove();
      chart.remove();
    };
  }, [visible, s]);
  return (
    <div ref={host} className="chart">
      {!visible && <span>차트 로딩 대기 · 실제 15분봉</span>}
    </div>
  );
}
