import type { Brand } from "./types";

// The home page's "Try" brands. A cron job refreshes their worldwide results before the cache expires, so
// anyone can open them without signing in (except podcasts and traffic, which are never cached).
export const FEATURED: Brand[] = [
  { name: "HelloFresh", domain: "hellofresh.com" },
  { name: "Factor", domain: "factor75.com" },
  { name: "Hungryroot", domain: "hungryroot.com" },
  { name: "AG1", domain: "drinkag1.com" },
  { name: "Liquid Death", domain: "liquiddeath.com" },
];
