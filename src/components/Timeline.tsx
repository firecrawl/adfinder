import { useCallback, useMemo, useState } from "react";
import type { ChannelData } from "../../shared/types";
import { compact, monthLabel } from "../format";

type Lane = {
  key: string;
  label: string;
  unit: string;
  color: string;
  kind: "line" | "bar";
  values: number[];
};

const RANGES = [6, 12, 24, 36] as const;
const LANE_H = 46;
const GAP = 14;

function lastMonths(n: number) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1 - i), 1));
    return x.toISOString().slice(0, 7);
  });
}

const tally = (months: string[], items: { month: string | null | undefined; value?: number }[]) => {
  const m = new Map<string, number>();
  for (const it of items) if (it.month) m.set(it.month, (m.get(it.month) ?? 0) + (it.value ?? 1));
  return months.map((k) => m.get(k) ?? 0);
};

export function Timeline({ data }: { data: Partial<ChannelData> }) {
  const [range, setRange] = useState<number>(24);
  const months = useMemo(() => lastMonths(range), [range]);
  const lanes = useMemo<Lane[]>(() => {
    const ym = (s: string | null | undefined) => s?.slice(0, 7);
    const series = (pts: { month: string; value: number }[] | undefined) =>
      tally(
        months,
        (pts ?? []).map((p) => ({ month: p.month, value: p.value })),
      );
    const all: Lane[] = [
      {
        key: "search",
        label: "Search interest",
        unit: "/100",
        color: "var(--series-search)",
        kind: "line",
        values: series(data.trends?.points),
      },
      {
        key: "traffic",
        label: "Website visits",
        unit: "visits",
        color: "var(--series-traffic)",
        kind: "line",
        values: series(data.traffic?.points),
      },
      {
        key: "meta",
        label: "Meta ads launched",
        unit: "ads",
        color: "var(--series-meta)",
        kind: "bar",
        values: tally(
          months,
          (data.meta?.ads ?? []).map((a) => ({ month: ym(a.startedAt) })),
        ),
      },
      {
        key: "google",
        label: "Google ads launched",
        unit: "ads",
        color: "var(--series-google)",
        kind: "bar",
        values: tally(
          months,
          (data.google?.ads ?? []).map((a) => ({ month: ym(a.firstShown) })),
        ),
      },
      {
        key: "podcasts",
        label: "Podcast ad reads",
        unit: "reads",
        color: "var(--series-podcasts)",
        kind: "bar",
        values: series(data.podcasts?.monthly),
      },
      {
        key: "ugc",
        label: "Creator post views",
        unit: "views",
        color: "var(--series-ugc)",
        kind: "bar",
        values: tally(
          months,
          (data.ugc?.posts ?? []).map((p) => ({ month: ym(p.published), value: p.views })),
        ),
      },
    ];
    return all.filter((l) => l.values.some((v) => v > 0));
  }, [data, months]);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the width it's shown at, so the labels stay 11–12px instead of shrinking with the chart.
  const [W, setW] = useState(1000);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setW(Math.max(280, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const LABEL = W < 600 ? 104 : 170;

  const switcher = (
    <div className="seg range" role="tablist" aria-label="Time range">
      {RANGES.map((n) => (
        <button
          key={n}
          role="tab"
          aria-selected={n === range}
          className={n === range ? "on" : ""}
          onClick={() => {
            setRange(n);
            setHover(null);
          }}
        >
          {n < 24 ? `${n} months` : `${n / 12} years`}
        </button>
      ))}
    </div>
  );
  if (!lanes.length)
    return (
      <>
        {switcher}
        <div className="skeleton" style={{ height: 260 }} />
      </>
    );

  const plotW = W - LABEL;
  const step = plotW / months.length;
  const H = lanes.length * (LANE_H + GAP) + 26;
  const x = (i: number) => LABEL + i * step;
  const every = (range <= 12 ? 1 : range <= 24 ? 3 : 6) * (W < 600 ? 2 : 1);

  return (
    <>
      {switcher}
      <div
        ref={measure}
        className="timeline"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(
            px < LABEL
              ? null
              : Math.min(months.length - 1, Math.max(0, Math.floor((px - LABEL) / step))),
          );
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`}>
          <title>Marketing activity by month</title>
          {lanes.map((l, li) => {
            const top = li * (LANE_H + GAP);
            const max = Math.max(...l.values, 1);
            const y = (v: number) => top + LANE_H - (v / max) * (LANE_H - 4);
            const peak = l.values.indexOf(Math.max(...l.values));
            return (
              <g key={l.key}>
                <text x={0} y={top + 20} className="lane-label">
                  {l.label}
                </text>
                <text x={0} y={top + 36} className="lane-sub">
                  peak {compact(max)} {l.unit === "/100" ? "" : l.unit}
                </text>
                <line
                  x1={LABEL}
                  x2={W}
                  y1={top + LANE_H + 0.5}
                  y2={top + LANE_H + 0.5}
                  stroke="var(--line)"
                />
                {l.kind === "bar" ? (
                  l.values.map(
                    (v, i) =>
                      v > 0 && (
                        <rect
                          key={i}
                          x={x(i) + 1}
                          y={y(v)}
                          width={Math.max(step - 2, 1)}
                          height={top + LANE_H - y(v)}
                          rx={2}
                          fill={l.color}
                          opacity={hover == null || hover === i ? 1 : 0.35}
                        />
                      ),
                  )
                ) : (
                  <>
                    <path
                      d={`M${x(0) + step / 2},${top + LANE_H} ${l.values.map((v, i) => `L${x(i) + step / 2},${y(v)}`).join(" ")} L${x(l.values.length - 1) + step / 2},${top + LANE_H} Z`}
                      fill={l.color}
                      opacity={0.08}
                    />
                    <path
                      d={l.values
                        .map((v, i) => `${i ? "L" : "M"}${x(i) + step / 2},${y(v)}`)
                        .join(" ")}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    <circle
                      cx={x(peak) + step / 2}
                      cy={y(max)}
                      r={4}
                      fill={l.color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  </>
                )}
              </g>
            );
          })}
          {months.map(
            (m, i) =>
              i % every === 0 && (
                <text key={m} x={x(i) + step / 2} y={H - 6} textAnchor="middle" className="axis">
                  {monthLabel(m)}
                </text>
              ),
          )}
          {hover != null && (
            <line
              x1={x(hover) + step / 2}
              x2={x(hover) + step / 2}
              y1={0}
              y2={H - 22}
              stroke="var(--text)"
              strokeOpacity={0.25}
              strokeDasharray="3 3"
            />
          )}
        </svg>
        {hover != null && (
          <div
            className="tip"
            style={{ left: `${Math.min(((x(hover) + step) / W) * 100, 72)}%`, top: 0 }}
          >
            <b>{monthLabel(months[hover] ?? "")}</b>
            {lanes.map((l) => (
              <div className="l" key={l.key}>
                <i style={{ background: l.color }} />
                {l.label}
                <span>{compact(l.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
