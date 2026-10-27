import { useSyncExternalStore } from "react";
import type { Brand } from "../shared/types";

export type Visit = ({ kind: "brand"; brand: Brand } | { kind: "compare"; a: Brand; b: Brand }) & {
  at: number;
};

const KEY = "adfinder:recent:v2";
const MAX = 16;
const listeners = new Set<() => void>();
let cache: Visit[] | null = null;

function read(): Visit[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as Visit[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: Visit[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private windows and blocked storage still keep the list for this tab.
  }
  for (const l of listeners) l();
}

const brandId = (b: Brand) => `${b.name}|${b.domain}|${b.country ?? ""}`;
export const visitId = (v: Visit) =>
  v.kind === "brand" ? brandId(v.brand) : `${brandId(v.a)} vs ${brandId(v.b)}`;

export const visitTitle = (v: Visit) =>
  v.kind === "brand" ? v.brand.name : `${v.a.name} vs ${v.b.name}`;

function add(v: Visit) {
  write([v, ...read().filter((r) => visitId(r) !== visitId(v))].slice(0, MAX));
}
export const remember = (brand: Brand) => add({ kind: "brand", brand, at: Date.now() });
export const rememberCompare = (a: Brand, b: Brand) =>
  add({ kind: "compare", a, b, at: Date.now() });
export const forget = (v: Visit) => write(read().filter((r) => visitId(r) !== visitId(v)));
export const clearRecent = () => write([]);

export const useRecent = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => [],
  );
