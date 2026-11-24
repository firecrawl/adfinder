import type { HookPatterns } from "../../shared/types";
import { compact } from "../format";
import { Card } from "./ui";

// A table on wide screens; under 640px each row becomes a card (see .patterns in index.css).
export function Patterns({ data }: { data: HookPatterns }) {
  if (!data.patterns.length) return null;
  return (
    <Card title="Hook patterns" meta="across Meta ads and creator posts">
      <table className="patterns">
        <thead>
          <tr>
            <th>Pattern</th>
            <th>Best example</th>
            <th className="num">Meta ads</th>
            <th className="num">Creator views</th>
          </tr>
        </thead>
        <tbody>
          {data.patterns.map((p) => (
            <tr key={p.name}>
              <td>
                <b>{p.name}</b>
                <p>{p.description}</p>
              </td>
              <td className="example">
                <q>{p.example}</q>
              </td>
              <td className="num" data-label="Meta ads">
                {p.meta.ads}
                {p.meta.winners > 0 && <small className="faint"> · {p.meta.winners} winners</small>}
              </td>
              <td className="num" data-label="Creator views">
                {p.ugc.posts ? compact(p.ugc.views) : "—"}
                {p.ugc.posts > 0 && <small className="faint"> · {p.ugc.posts} posts</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
