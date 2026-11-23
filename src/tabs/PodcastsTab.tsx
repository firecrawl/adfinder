import { Calculator, ExternalLink, Mic } from "lucide-react";
import { podcastBand, podcastSpend } from "../../shared/spend";
import { useState } from "react";
import type { PodcastData, PodcastRead } from "../../shared/types";
import type { Load } from "../api";
import {
  Accordion,
  Card,
  Empty,
  Facts,
  Loaded,
  ParticleCredit,
  Sheet,
  Stat,
} from "../components/ui";
import { compact, date, usdRange } from "../format";

export function PodcastsTab({
  load,
  brandName,
  global,
}: {
  load: Load<PodcastData>;
  brandName: string;
  global: boolean;
}) {
  const [open, setOpen] = useState<PodcastRead | null>(null);
  return (
    <Loaded load={load}>
      {(d) =>
        !d.sponsor ? (
          <Empty title={`${brandName} doesn't sponsor podcasts`}>
            Particle tracks ad reads across thousands of shows and found none for this brand.
          </Empty>
        ) : (
          <>
            <div className="stats">
              <Stat
                label="Podcast ad reads"
                value={compact(d.sponsor.ads)}
                sub="last 3 years"
                color="var(--series-podcasts)"
              />
              <Stat
                label="Shows"
                value={compact(d.sponsor.shows)}
                sub={`${compact(d.sponsor.episodes)} episodes`}
              />
              <Stat label="Estimated podcast spend" value={usdRange(podcastSpend(d))} />
              <Stat label="Latest read" value={date(d.sponsor.lastSeen)} />
            </div>
            {global && (
              <p className="faint" style={{ margin: "-8px 0 18px" }}>
                Podcasts cover every country.
              </p>
            )}
            <div className="card" style={{ marginBottom: 22 }}>
              <Accordion
                icon={
                  <span className="ico" style={{ background: "var(--surface-2)" }}>
                    <Calculator size={15} />
                  </span>
                }
                title="How the spend estimate works"
              >
                <div className="estimate">
                  <p>
                    Each read is priced at $25–$50 per 1,000 downloads, with audience estimated from
                    the show's popularity. A rough range, not reported spend.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Show</th>
                        <th>Assumed audience per episode</th>
                        <th>Per read</th>
                        <th>Reads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.shows.map((s) => {
                        const [, audience, range] = podcastBand(s.popularity);
                        return (
                          <tr key={s.title}>
                            <td>{s.title}</td>
                            <td>{audience}</td>
                            <td>{usdRange(range)}</td>
                            <td>{s.ads}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Accordion>
            </div>
            <div className="grid2">
              <Card title="Latest ad reads" meta="Click to listen">
                <div className="list">
                  {d.reads.map((r) => (
                    <button className="row" key={r.id} onClick={() => setOpen(r)}>
                      {r.showImage ? (
                        <img className="art" src={r.showImage} alt="" loading="lazy" />
                      ) : (
                        <span className="art" />
                      )}
                      <div className="main">
                        <div className="t">{r.show}</div>
                        <div className="d">{r.summary.split("\n")[0]}</div>
                      </div>
                      <div className="num">
                        {r.seconds}s<small>{date(r.date)}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
              <Card title="Where they spend" meta="by ad reads">
                <div className="list">
                  {d.shows.map((s, i) => (
                    <div className="row" key={s.title}>
                      <span className="rank">{i + 1}</span>
                      {s.image ? (
                        <img className="art" src={s.image} alt="" loading="lazy" />
                      ) : (
                        <span className="art" />
                      )}
                      <div className="main">
                        <div className="t">{s.title}</div>
                        <div className="d">{s.publisher}</div>
                      </div>
                      <div className="num">
                        {s.ads}
                        <small>reads</small>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <ParticleCredit />
            {open && (
              <Sheet
                title={
                  <>
                    <Mic size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                    Podcast ad read
                  </>
                }
                onClose={() => setOpen(null)}
              >
                <div>
                  <h4>{open.show}</h4>
                  <p className="quote">{open.title}</p>
                  <p className="faint" style={{ marginTop: 6 }}>
                    {open.episode}
                  </p>
                </div>
                {open.audio && (
                  <audio src={open.audio} controls autoPlay>
                    <track kind="captions" />
                  </audio>
                )}
                <p className="prose">{open.summary}</p>
                <Facts
                  items={[
                    ["Read by", open.hostRead ? "Host" : "Pre-recorded"],
                    ["Length", `${open.seconds} seconds`],
                    ["Aired", date(open.date)],
                    ["Show", open.show],
                  ]}
                />
                {open.url && (
                  <a className="btn outline" href={open.url} target="_blank" rel="noreferrer">
                    Open the episode <ExternalLink size={14} />
                  </a>
                )}
              </Sheet>
            )}
          </>
        )
      }
    </Loaded>
  );
}
