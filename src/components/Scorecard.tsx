import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Brand, Summary } from "../../shared/types";
import type { Load } from "../api";
import { logo } from "../format";
import { Loaded } from "./ui";

// A brand at a glance: its key numbers, the summary's headline and verdict, and a 0–10 score per
// channel. The Overview adds the insights beside it; the report (Phase 5) reuses it on its own.
export function Scorecard({
  stats,
  summary,
  onCompareWith,
  aside,
}: {
  stats: ReactNode;
  summary: Load<Summary>;
  onCompareWith?: (b: Brand) => void;
  aside?: (s: Summary) => ReactNode;
}) {
  return (
    <section className="scorecard" id="scorecard">
      {stats}
      <Loaded load={summary} skeleton={<SummarySkeleton />}>
        {(s) => (
          <section className={`card ai ${aside ? "split" : ""}`}>
            <div className="body" style={{ paddingTop: 20 }}>
              <span className="label">
                <Sparkles size={14} />
                What's working
              </span>
              <h2>{s.headline}</h2>
              <p className="verdict">{s.verdict}</p>
              <div className="scores">
                {s.channels.map((c) => (
                  <div className="score" key={c.channel}>
                    <span>{c.channel}</span>
                    <div className="bar">
                      <i style={{ width: `${c.score * 10}%` }} />
                    </div>
                    <b>{c.score}</b>
                    <small>{c.note}</small>
                  </div>
                ))}
              </div>
              {onCompareWith && s.competitors?.length > 0 && (
                <div className="compare-with">
                  Compare with
                  {s.competitors.map((c) => (
                    <button className="chip" key={c.domain} onClick={() => onCompareWith(c)}>
                      <img src={logo(c.domain, 64)} alt="" />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {aside?.(s)}
          </section>
        )}
      </Loaded>
    </section>
  );
}

function SummarySkeleton() {
  return (
    <section className="card ai">
      <div className="body" style={{ paddingTop: 20, display: "grid", gap: 12 }}>
        <span className="label">
          <span className="spin" style={{ width: 12, height: 12 }} />
          Analysing every channel…
        </span>
        <div className="skeleton" style={{ height: 28, width: "80%" }} />
        <div className="skeleton" style={{ height: 16 }} />
        <div className="skeleton" style={{ height: 16, width: "70%" }} />
        <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
      </div>
    </section>
  );
}
