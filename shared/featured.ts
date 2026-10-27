import type { Brand } from "./types";

// The home page's "Try" brands. Their worldwide results are kept permanently and refreshed by a cron job,
// so anyone can open them without signing in.
export const FEATURED: Brand[] = [
  { name: "HelloFresh", domain: "hellofresh.com" },
  { name: "Factor", domain: "factor75.com" },
  { name: "Hungryroot", domain: "hungryroot.com" },
  { name: "AG1", domain: "drinkag1.com" },
  { name: "Liquid Death", domain: "liquiddeath.com" },
];
