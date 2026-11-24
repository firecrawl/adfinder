const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

// Loaded after the page, and only with a key (so local dev and forks send nothing).
const client = key
  ? import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host:
          (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com",
        // Memory only: no cookies or local storage until there are accounts to ask consent from.
        persistence: "memory",
        person_profiles: "never",
        // Page views, timings and the events below only; no click tracking.
        autocapture: false,
        capture_pageview: "history_change",
        capture_performance: { web_vitals: true },
        disable_session_recording: true,
      });
      return posthog;
    })
  : null;

type Events = {
  search: { brand: string };
  brand_viewed: { brand: string; country: string };
  tab_opened: { tab: string };
  compare_started: { a: string; b: string };
  sign_in_started: { mode: string };
  sign_in_completed: { mode: string };
  channel_loaded: { channel: string; ms: number; cached: boolean | null; ok: boolean };
  analysis_loaded: { analysis: string; ms: number; partial: boolean; ok: boolean };
};

// Brands and timings only: never a Firecrawl key, a cookie or anything typed into the sign-in form.
export function track<E extends keyof Events>(event: E, props: Events[E]) {
  void client?.then((p) => p.capture(event, props));
}
