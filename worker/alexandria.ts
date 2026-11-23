export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Alexandria capability calls, plus `html` for a page's rendered HTML (the Meta Ad Library fallback).
export type Alexandria = ((
  provider: string,
  capability: string,
  options: Record<string, unknown>,
) => Promise<any>) & {
  html: (url: string) => Promise<string>;
};

const FIRECRAWL = "https://api.firecrawl.dev/v2";

// Adds up the Firecrawl credits a job spends, for the analytics events.
export type Meter = { credits: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(
  key: string,
  body: unknown,
  pick: (j: any) => { data?: any; retryAfter?: number; error?: string },
  meter?: Meter,
  endpoint = "scrape",
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${FIRECRAWL}/${endpoint}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403)
      throw new ApiError("Firecrawl rejected this API key.", 401);
    if (r.status === 402) throw new ApiError("This Firecrawl account is out of credits.", 402);
    if (r.status === 429) {
      await sleep((Number(String(j.error).match(/retry after (\d+)s/)?.[1] ?? 10) + 1) * 1000);
      continue;
    }
    if (meter)
      meter.credits += Number(
        j.data?.creditsCost ?? j.data?.metadata?.creditsUsed ?? j.creditsUsed ?? 0,
      );
    if (!r.ok || j.success === false)
      throw new ApiError(j.error || `Firecrawl error ${r.status}`, 502);
    const out = pick(j);
    if (out.data !== undefined) return out.data;
    if (out.retryAfter === undefined) throw new ApiError(out.error ?? "No data returned", 502);
    await sleep((out.retryAfter + attempt * 2) * 1000);
  }
  throw new ApiError("Firecrawl is still rate-limiting this account. Try again in a minute.", 429);
}

export function alexandriaFor(key: string, meter?: Meter): Alexandria {
  const call = (provider: string, capability: string, options: Record<string, unknown>) =>
    post(
      key,
      { alexandria: [{ provider, capability, options }] },
      (j) => {
        const item = j.data?.alexandria?.[0];
        if (item?.data) return { data: item.data };
        if (item?.error?.code === "provider_rate_limited")
          return { retryAfter: item.error.retryAfterSeconds ?? 2 };
        return { error: item?.error?.message };
      },
      meter,
    );
  const html = (url: string) =>
    post(
      key,
      {
        url,
        formats: ["rawHtml"],
        waitFor: 3000,
        // The Ad Library loads more cards as you scroll.
        actions: [1, 2, 3, 4].flatMap(() => [
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1500 },
        ]),
        onlyMainContent: false,
        timeout: 90_000,
      },
      (j) => ({
        data: j.data?.rawHtml,
        error: "The page returned no data",
      }),
      meter,
    );
  return Object.assign(call, { html });
}

export type WebResult = { url: string; title?: string; description?: string };
export const webSearch = (
  key: string,
  query: string,
  meter?: Meter,
  limit = 5,
): Promise<WebResult[]> =>
  post(key, { query, limit }, (j) => ({ data: j.data?.web ?? [] }), meter, "search");

export async function credits(key: string) {
  const r = await fetch(`${FIRECRAWL}/team/credit-usage`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (r.status === 401 || r.status === 403) return null;
  const j: any = await r.json().catch(() => ({}));
  const d = j.data ?? j;
  return { remainingCredits: d.remainingCredits ?? d.remaining_credits ?? 0 };
}
