import type { Brand, Verdict } from "../shared/types";

const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const compact = (n: number | null | undefined) => (n == null ? "—" : compactFmt.format(n));
export const pct = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
export const monthLabel = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

export const daysLabel = (d: number) =>
  d >= 365 ? `${(d / 365).toFixed(1)} yrs` : d >= 60 ? `${Math.round(d / 30)} mo` : `${d} days`;

export const statusLabel = (verdict: Verdict, active: boolean) =>
  verdict === "winner"
    ? "Winner, still running"
    : verdict === "cut"
      ? "Cut within 2 weeks"
      : active
        ? "Running"
        : "Stopped";

export const logo = (domain: string, size = 128) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;

export const brandParams = (b: Brand) =>
  new URLSearchParams({
    q: b.name,
    ...(b.domain ? { d: b.domain } : {}),
    ...(b.country ? { c: b.country } : {}),
  });

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
export const usdRange = ([lo, hi]: [number, number]) =>
  lo === hi ? usd0.format(lo) : `${usd0.format(lo)}–${usd0.format(hi)}`;

const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export const timeAgo = (t: number) => {
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} hr ago`;
  return ago.format(-Math.floor(mins / 60 / 24), "day");
};

export const COUNTRIES: [string, string][] = [
  ["", "Worldwide"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["ES", "Spain"],
  ["IT", "Italy"],
];
