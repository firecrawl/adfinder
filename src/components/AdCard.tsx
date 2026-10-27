import { ImageOff, Play } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet } from "./ui";

type CardProps = {
  image: string | null;
  // Shown as the creative when there's no image, or it fails to load.
  text?: string;
  video?: boolean;
  wide?: boolean;
  badges?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  foot?: ReactNode;
};

function AdCard({
  image,
  text,
  video,
  wide,
  badges,
  title,
  sub,
  foot,
  onOpen,
}: CardProps & { onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button className="ad" onClick={onOpen}>
      <div className={`media ${wide ? "wide" : ""}`}>
        {image && !broken ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        ) : text ? (
          <span className="textad">{text}</span>
        ) : (
          <ImageOff size={28} />
        )}
        {video && (
          <span className="play">
            <Play size={18} fill="currentColor" />
          </span>
        )}
        {badges && <span className="corner">{badges}</span>}
      </div>
      <div className="txt">
        <div className="hook">{title}</div>
        {sub && <div className="one">{sub}</div>}
        {foot && <div className="foot">{foot}</div>}
      </div>
    </button>
  );
}

// A filterable grid of creatives; clicking one slides its detail sheet in from the right.
export function AdBrowser<T extends { id: string }, F extends string>({
  items,
  filters,
  keep,
  note,
  card,
  sheet,
  limit,
}: {
  items: T[];
  limit?: number;
  filters: [F, string][];
  keep: (f: F) => (item: T) => boolean;
  note?: string;
  card: (item: T) => CardProps;
  sheet: (item: T) => { title: ReactNode; body: ReactNode };
}) {
  const [filter, setFilter] = useState<F | undefined>(filters[0]?.[0]);
  const [open, setOpen] = useState<T | null>(null);
  const kept = filter ? items.filter(keep(filter)) : items;
  const shown = limit ? kept.slice(0, limit) : kept;
  const detail = open && sheet(open);
  return (
    <>
      {(filters.length > 1 || note) && (
        <div className="toolbar">
          {filters.length > 1 && (
            <div className="seg" role="tablist">
              {filters.map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={v === filter}
                  className={v === filter ? "on" : ""}
                  onClick={() => setFilter(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {note && <span className="note">{note}</span>}
        </div>
      )}
      <div className="ads">
        {shown.map((it) => (
          <AdCard key={it.id} {...card(it)} onOpen={() => setOpen(it)} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="muted" style={{ padding: "24px 0" }}>
          Nothing matches this filter.
        </p>
      )}
      {detail && (
        <Sheet title={detail.title} onClose={() => setOpen(null)}>
          {detail.body}
        </Sheet>
      )}
    </>
  );
}
