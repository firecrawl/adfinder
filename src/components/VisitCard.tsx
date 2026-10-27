import { X } from "lucide-react";
import { logo, timeAgo } from "../format";
import { forget, visitTitle as title, type Visit } from "../recent";

export function VisitLogos({ visit: v, size }: { visit: Visit; size: number }) {
  if (v.kind === "brand") return <img src={logo(v.brand.domain || v.brand.name, size)} alt="" />;
  return (
    <span className="pair">
      <img src={logo(v.a.domain, size)} alt="" />
      <img src={logo(v.b.domain, size)} alt="" />
    </span>
  );
}

export function VisitCard({ visit: v, onOpen }: { visit: Visit; onOpen: (v: Visit) => void }) {
  return (
    <div className="recent-card">
      <button className="open" aria-label={`Open ${title(v)}`} onClick={() => onOpen(v)}>
        <VisitLogos visit={v} size={64} />
        <span>
          <b>{title(v)}</b>
          <small>
            {v.kind === "compare"
              ? "Comparison · "
              : v.brand.country
                ? `${v.brand.country} · `
                : ""}
            {timeAgo(v.at)}
          </small>
        </span>
      </button>
      <button
        className="remove"
        aria-label={`Remove ${title(v)}`}
        title="Remove"
        onClick={() => forget(v)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
