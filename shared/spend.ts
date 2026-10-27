import type { PodcastData, UgcPost } from "./types";

export type Range = [number, number];

// 2026 sponsored-post rate cards by follower tier (Hootsuite, Talentir, Stan). Real deals often land lower:
// OpenSponsorship's median across 1,527 campaigns was $134-$2,727 per deliverable.
const CREATOR_RATES: Record<UgcPost["platform"], [number, Range][]> = {
  instagram: [
    [1_000_000, [15_000, 50_000]],
    [500_000, [5_000, 15_000]],
    [50_000, [2_000, 5_000]],
    [10_000, [200, 2_000]],
    [0, [20, 200]],
  ],
  tiktok: [
    [1_000_000, [20_000, 50_000]],
    [500_000, [5_000, 20_000]],
    [50_000, [2_000, 5_000]],
    [10_000, [500, 2_000]],
    [0, [20, 500]],
  ],
};

export const creatorTier = (followers: number) =>
  followers >= 1_000_000
    ? "Mega (1M+)"
    : followers >= 500_000
      ? "Macro (500K-1M)"
      : followers >= 50_000
        ? "Mid-tier (50K-500K)"
        : followers >= 10_000
          ? "Micro (10K-50K)"
          : "Nano (under 10K)";

export const postCost = (p: UgcPost): Range =>
  CREATOR_RATES[p.platform].find(([min]) => p.followers >= min)?.[1] ?? [0, 0];

// Only posts marked as ads, from creators other than the brand itself, are paid placements.
export const isSponsored = (p: UgcPost) => p.paid && !p.own;

export function creatorSpend(posts: UgcPost[]) {
  const paid = posts.filter(isSponsored);
  return {
    posts: paid.length,
    range: paid.reduce<Range>(
      (t, p) => {
        const [lo, hi] = postCost(p);
        return [t[0] + lo, t[1] + hi];
      },
      [0, 0],
    ),
  };
}

// Particle has no download counts, only a 0-1 popularity score, so each band assumes an audience per
// episode and prices one host-read at the $25-$50 CPM range podcast networks publish.
const PODCAST_BANDS: [number, string, Range][] = [
  [0.98, "50K-250K downloads", [1_250, 12_500]],
  [0.9, "10K-50K downloads", [250, 2_500]],
  [0.75, "2K-10K downloads", [50, 500]],
  [0, "500-2K downloads", [12, 100]],
];
export const podcastBand = (popularity: number | null) =>
  PODCAST_BANDS.find(([min]) => (popularity ?? 0.75) >= min) ?? PODCAST_BANDS[2]!;

export function podcastSpend(d: PodcastData): Range {
  const listed = d.shows.reduce((n, s) => n + s.ads, 0);
  const rest = Math.max(0, (d.sponsor?.ads ?? 0) - listed);
  const [, , tail] = podcastBand(null);
  return d.shows.reduce<Range>(
    (t, s) => {
      const [, , [lo, hi]] = podcastBand(s.popularity);
      return [t[0] + s.ads * lo, t[1] + s.ads * hi];
    },
    [rest * tail[0], rest * tail[1]],
  );
}
