import { useCallback, useEffect, useState } from "react";
import type {
  Brand,
  Channel,
  ChannelData,
  CompareEvent,
  Complaints,
  HookPatterns,
  Summary,
  Translations,
} from "../shared/types";

class HttpError extends Error {
  auth?: string;
  constructor(message: string, auth?: string) {
    super(message);
    this.auth = auth;
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const j = await r.json().catch(() => ({ error: `Request failed (${r.status})` }));
  if (!r.ok) throw new HttpError(j.error ?? `Request failed (${r.status})`, j.auth);
  return j as T;
}

// Brand results already fetched this session, so moving between pages (a comparison and each brand in
// it) doesn't ask the server again. Failures are dropped so they can be retried.
const memo = new Map<string, Promise<unknown>>();
export const clearMemo = () => memo.clear();
function load<T>(path: string, body: unknown): Promise<T> {
  const key = `${path} ${JSON.stringify(body)}`;
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = api<T>(path, body);
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return p;
}

export type Me = {
  connected: boolean;
  teamName?: string;
  remainingCredits?: number;
  rejected?: boolean;
};

export type Load<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: string; auth?: string };
export type BrandState = { [K in Channel]: Load<ChannelData[K]> } & {
  summary: Load<Summary> | null;
  hooks: Load<HookPatterns> | null;
  complaints: Load<Complaints> | null;
};

const CHANNELS: Channel[] = ["meta", "google", "podcasts", "ugc", "trends", "traffic", "reviews"];
const loading = (): BrandState =>
  ({
    ...Object.fromEntries(CHANNELS.map((c) => [c, { status: "loading" }])),
    summary: null,
    hooks: null,
    complaints: null,
  }) as BrandState;
const fail = (e: unknown) => ({
  status: "error" as const,
  error: (e as Error).message,
  auth: (e as HttpError).auth,
});

export function useBrand(brand: Brand, epoch: number) {
  const id = `${brand.name}|${brand.domain}|${brand.country ?? ""}|${epoch}`;
  const [store, setStore] = useState<{ id: string; state: BrandState } | null>(null);
  useEffect(() => {
    let live = true;
    const set = (patch: Partial<BrandState>) =>
      live &&
      setStore((s) => ({ id, state: { ...(s?.id === id ? s.state : loading()), ...patch } }));
    void Promise.allSettled(
      CHANNELS.map((ch) =>
        load(`/api/channel/${ch}`, brand).then(
          (data) => set({ [ch]: { status: "ok", data } }),
          (e) => {
            set({ [ch]: fail(e) });
            throw e;
          },
        ),
      ),
    ).then((rs) => {
      if (rs.every((r) => r.status === "rejected")) return;
      set({
        summary: { status: "loading" },
        hooks: { status: "loading" },
        complaints: { status: "loading" },
      });
      load<Summary>("/api/summary", brand).then(
        (data) => set({ summary: { status: "ok", data } }),
        (e) => set({ summary: fail(e) }),
      );
      load<HookPatterns>("/api/hooks", brand).then(
        (data) => set({ hooks: { status: "ok", data } }),
        (e) => set({ hooks: fail(e) }),
      );
      load<Complaints>("/api/complaints", brand).then(
        (data) => set({ complaints: { status: "ok", data } }),
        (e) => set({ complaints: fail(e) }),
      );
    });
    return () => {
      live = false;
    };
  }, [brand, id]);
  return store?.id === id ? store.state : loading();
}

export function useTranslations(brand: Brand, enabled: boolean) {
  const id = `${brand.name}|${brand.domain}|${brand.country ?? ""}`;
  const [store, setStore] = useState<{ id: string; load: Load<Translations> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load<Translations>("/api/translate", brand).then(
      (data) => live && setStore({ id, load: { status: "ok", data } }),
      (e) => live && setStore({ id, load: fail(e) }),
    );
    return () => {
      live = false;
    };
  }, [brand, id, enabled]);
  return enabled ? (store?.id === id ? store.load : { status: "loading" as const }) : null;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(
    () => api<Me>("/api/me").then(setMe, () => setMe({ connected: false })),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return [me, refresh] as const;
}

export async function streamCompare(a: Brand, b: Brand, onEvent: (e: CompareEvent) => void) {
  const r = await fetch("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ a, b }),
  });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    onEvent({ type: "error", error: j.error ?? `Request failed (${r.status})` });
    return;
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.split("\n").find((l) => l.startsWith("data:"));
      if (line) onEvent(JSON.parse(line.slice(5).trim()) as CompareEvent);
    }
  }
}

export const signInUrl = async () => {
  const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const session = [...rand(32)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const verifier = b64url(rand(32));
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  return {
    session,
    verifier,
    url: `https://www.firecrawl.dev/cli-auth?code_challenge=${challenge}&source=coding-agent#session_id=${session}`,
  };
};
