import { useState } from "react";
import type { Verdict } from "../../shared/types";
import { daysLabel, monthLabel } from "../format";

export type Run = {
  id: string;
  label: string;
  start: string | null;
  end: string | null;
  verdict: Verdict;
  active: boolean;
};

const DAY = 86_400_000;

// One bar per ad from first to last seen, on a shared date axis, longest first.
export function Longevity({ runs, max = 15 }: { runs: Run[]; max?: number }) {
  const [now] = useState(Date.now);
  const rows = runs
    .flatMap((r) => {
      // A stopped ad with no end date has an unknown run length.
      if (!r.start || (!r.active && !r.end)) return [];
      const s = Date.parse(r.start);
      const e = r.active || !r.end ? now : Date.parse(r.end);
      return [{ ...r, s, e, days: Math.max(1, Math.round((e - s) / DAY)) }];
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, max);
  if (!rows.length) return null;
  const from = Math.min(...rows.map((r) => r.s));
  const span = Math.max(now - from, DAY);
  const at = (t: number) => ((t - from) / span) * 100;
  const months = Math.max(1, Math.round(span / (30 * DAY)));
  const step = months > 30 ? 12 : months > 12 ? 6 : months > 4 ? 2 : 1;
  const ticks: number[] = [];
  const d = new Date(from);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() < now) {
    if (d.getUTCMonth() % step === 0) ticks.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return (
    <div className="longevity">
      <div className="legend" style={{ marginBottom: 10 }}>
        <span>
          <i style={{ background: "var(--good)" }} />
          Winner, still running
        </span>
        <span>
          <i style={{ background: "var(--bad)" }} />
          Cut within 2 weeks
        </span>
        <span>
          <i style={{ background: "var(--neutral-mark)" }} />
          Other
        </span>
      </div>
      {rows.map((r) => (
        <div
          className="lrow"
          key={r.id}
          title={`${r.label} · ${daysLabel(r.days)}${r.active ? " · still running" : ""}`}
        >
          <span className="lname">{r.label}</span>
          <div className="track">
            <span
              className={`bar ${r.verdict ?? ""}`}
              style={{ left: `${at(r.s)}%`, width: `${Math.max(at(r.e) - at(r.s), 0.6)}%` }}
            />
          </div>
          <span className="dur">{daysLabel(r.days)}</span>
        </div>
      ))}
      <div className="axis">
        <span />
        <div className="ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${at(t)}%` }}>
              {monthLabel(new Date(t).toISOString().slice(0, 7))}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
