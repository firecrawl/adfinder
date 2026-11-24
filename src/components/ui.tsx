import { ChevronDown, X } from "lucide-react";
import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { PARTICLE_ATTRIBUTION } from "../../shared/channels";
import type { Share, Verdict } from "../../shared/types";
import type { Load } from "../api";
import { pct } from "../format";
import { NextSteps } from "../nextSteps";
import { useSession } from "../session";

export function Wordmark({ size = "sm", onClick }: { size?: "sm" | "lg"; onClick?: () => void }) {
  const inner = (
    <>
      ad<span>finder</span>
      <span className="dot">.</span>
    </>
  );
  return onClick ? (
    <a
      href="/"
      className={`wordmark ${size}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {inner}
    </a>
  ) : (
    <span className={`wordmark ${size}`}>{inner}</span>
  );
}

// Particle's terms require the credit wherever its podcast data is shown.
export function ParticleCredit() {
  return (
    <p className="faint" style={{ marginTop: 18 }}>
      {PARTICLE_ATTRIBUTION}
    </p>
  );
}

export function Empty({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

// A provider returned nothing for this brand. With a country picked, searching everywhere may help.
export function NoResults({ title, children }: { title: string; children: ReactNode }) {
  const next = useContext(NextSteps);
  return (
    <Empty
      title={title}
      actions={
        next?.worldwide && (
          <button className="btn outline" onClick={next.worldwide}>
            Search worldwide instead
          </button>
        )
      }
    >
      {children}
    </Empty>
  );
}

export function SignInPrompt() {
  const { openSignIn } = useSession();
  return (
    <Empty
      title="Sign in to research this brand"
      actions={
        <button className="btn fire" onClick={() => openSignIn()}>
          <img src="/firecrawl.svg" alt="" />
          Sign in with Firecrawl
        </button>
      }
    >
      adfinder pulls live ad data through Firecrawl Alexandria, on your own Firecrawl account.
    </Empty>
  );
}

export function Loaded<T>({
  load,
  skeleton,
  children,
}: {
  load: Load<T> | null;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (!load || load.status === "loading")
    return <>{skeleton ?? <div className="skeleton" style={{ height: 240 }} />}</>;
  if (load.status === "error")
    return load.auth === "missing" ? <SignInPrompt /> : <Failed error={load.error} />;
  return <>{children(load.data)}</>;
}

function Failed({ error }: { error: string }) {
  const next = useContext(NextSteps);
  return (
    <Empty
      title="Couldn't load this"
      actions={
        next && (
          <button className="btn outline" onClick={next.retry}>
            Try again
          </button>
        )
      }
    >
      {error}
    </Empty>
  );
}

export function AdSkeletons({ n = 8 }: { n?: number }) {
  return (
    <div className="ads">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function VerdictBadge({ verdict, active }: { verdict: Verdict; active?: boolean }) {
  if (verdict === "winner") return <span className="badge winner">Winner</span>;
  if (verdict === "cut") return <span className="badge cut">Cut fast</span>;
  return active ? <span className="badge live">Live</span> : null;
}

export function Strength({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="strength" title={`Meta delivery strength ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  );
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      {right && <div className="right">{right}</div>}
    </div>
  );
}

export function Card({
  title,
  meta,
  children,
  className = "",
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header>
          <h3>{title}</h3>
          {meta && <span className="meta">{meta}</span>}
        </header>
      )}
      <div className="body">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  color,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  loading?: boolean;
}) {
  return (
    <div className="stat">
      <div className="k">
        {color && <i style={{ background: color }} />}
        {label}
      </div>
      {loading ? <div className="v skeleton" /> : <div className="v">{value}</div>}
      {sub && !loading && <div className="s">{sub}</div>}
    </div>
  );
}

export function Mix({ title, rows, color }: { title: string; rows: Share[]; color: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.share));
  return (
    <div className="mix">
      <h5>{title}</h5>
      {rows.map((r) => (
        <div className="r" key={r.label}>
          <span title={r.label}>{r.label}</span>
          <div className="bar">
            <i style={{ width: `${(r.share / max) * 100}%`, background: color }} />
          </div>
          <b>{pct(r.share)}</b>
        </div>
      ))}
    </div>
  );
}

export function Accordion({
  icon,
  title,
  count,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc ${open ? "open" : ""}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon}
        <span className="ttl">{title}</span>
        {count != null && <span className="cnt">{count}</span>}
        <ChevronDown size={18} className="chev" />
      </button>
      {open && children}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <dialog open className="sheet" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="scroll">{children}</div>
      </dialog>
    </>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const WIDE = "(min-width: 721px)";
const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
  );

// A section that's always shown on wide screens and folded behind a button on phones, so the
// summary isn't followed by thousands of pixels of detail.
export function Fold({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  return (
    <section className="fold" id={id}>
      {wide || open ? (
        children
      ) : (
        <button className="fold-btn" aria-expanded={false} onClick={() => setOpen(true)}>
          {title}
          <ChevronDown size={18} />
        </button>
      )}
    </section>
  );
}

// A list of a page's sections, in the left margin of wide screens (see .section-nav).
export function SectionNav({ sections }: { sections: [id: string, label: string][] }) {
  return (
    <nav className="section-nav" aria-label="Sections">
      <ul>
        {sections.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
