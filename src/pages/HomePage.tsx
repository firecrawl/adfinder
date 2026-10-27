import { GitCompareArrows, Search } from "lucide-react";
import { useState } from "react";
import { FEATURED } from "../../shared/featured";
import type { Brand } from "../../shared/types";
import { SearchBox } from "../components/SearchBox";
import { Wordmark } from "../components/ui";
import { VisitCard } from "../components/VisitCard";
import { logo } from "../format";
import { clearRecent, useRecent, visitId } from "../recent";


export function HomePage({
  onSearch,
  onCompare,
  startCompare,
}: {
  onSearch: (b: Brand) => void;
  onCompare: (a: Brand, b: Brand) => void;
  startCompare: boolean;
}) {
  const [comparing, setComparing] = useState(startCompare);
  const [a, setA] = useState<Brand | null>(null);
  const [b, setB] = useState<Brand | null>(null);
  const recent = useRecent();
  return (
    <main className="home">
      <Wordmark size="lg" />
      <p className="tagline">Every ad, sponsorship and creator campaign behind any business.</p>
      {comparing ? (
        <div className="compare-inputs">
          <SearchBox
            key={`a${a?.domain ?? ""}`}
            value={a}
            onPick={setA}
            submitOnPick={false}
            placeholder="First business"
            focusOnMount
          />
          <span className="vs">VS</span>
          <SearchBox
            key={`b${b?.domain ?? ""}`}
            value={b}
            onPick={setB}
            submitOnPick={false}
            placeholder="Second business"
          />
        </div>
      ) : (
        <SearchBox value={null} onPick={onSearch} focusOnMount />
      )}
      <div className="actions">
        {comparing ? (
          <>
            <button
              className="btn fire"
              disabled={!a || !b}
              onClick={() => a && b && onCompare(a, b)}
            >
              <GitCompareArrows size={16} />
              Compare
            </button>
            <button className="btn ghost" onClick={() => setComparing(false)}>
              <Search size={16} />
              Search one
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={() => setComparing(true)}>
            <GitCompareArrows size={16} />
            Compare two businesses
          </button>
        )}
      </div>
      <div className="chips">
        <span>Try</span>
        {FEATURED.map((e) => (
          <button
            key={e.domain}
            className="chip"
            onClick={() => (comparing ? (a ? setB(e) : setA(e)) : onSearch(e))}
          >
            <img src={logo(e.domain, 64)} alt="" />
            {e.name}
          </button>
        ))}
      </div>
      {recent.length > 0 && !comparing && (
        <section className="recent">
          <div className="recent-head">
            <h2>Recently viewed</h2>
            <button className="linkish" onClick={clearRecent}>
              Clear
            </button>
          </div>
          <div className="recent-grid">
            {recent.slice(0, 8).map((v) => (
              <VisitCard
                key={visitId(v)}
                visit={v}
                onOpen={(x) => (x.kind === "brand" ? onSearch(x.brand) : onCompare(x.a, x.b))}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
