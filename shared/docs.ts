// What the docs page and /llms.txt both say about the MCP server, kept in one place so they can't drift.
import { FEATURED } from "./featured";

export const SITE = "https://adfinder.pandor.cc";
export const ENDPOINT = `${SITE}/mcp`;
export const KEYS_URL = "https://www.firecrawl.dev/app/api-keys";
export const FREE_BRANDS = FEATURED.map((b) => `${b.name} (${b.domain})`).join(", ");

export type Client = { id: string; name: string; where: string; lang: string; code: string };
export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    where: "Run in a terminal",
    lang: "sh",
    code: `claude mcp add --transport http adfinder ${ENDPOINT} \\
  --header "Authorization: Bearer fc-YOUR-KEY"`,
  },
  {
    id: "codex",
    name: "Codex",
    where: "Add to ~/.codex/config.toml, with FIRECRAWL_API_KEY set in your shell",
    lang: "toml",
    code: `[mcp_servers.adfinder]
url = "${ENDPOINT}"
bearer_token_env_var = "FIRECRAWL_API_KEY"`,
  },
  {
    id: "cursor",
    name: "Cursor",
    where: "Add to ~/.cursor/mcp.json",
    lang: "json",
    code: `{
  "mcpServers": {
    "adfinder": {
      "url": "${ENDPOINT}",
      "headers": { "Authorization": "Bearer fc-YOUR-KEY" }
    }
  }
}`,
  },
  {
    id: "vscode",
    name: "VS Code",
    where: "Add to .vscode/mcp.json",
    lang: "json",
    code: `{
  "servers": {
    "adfinder": {
      "type": "http",
      "url": "${ENDPOINT}",
      "headers": { "Authorization": "Bearer fc-YOUR-KEY" }
    }
  }
}`,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    where: "Add to ~/.gemini/settings.json",
    lang: "json",
    code: `{
  "mcpServers": {
    "adfinder": {
      "httpUrl": "${ENDPOINT}",
      "headers": { "Authorization": "Bearer fc-YOUR-KEY" }
    }
  }
}`,
  },
  {
    id: "other",
    name: "Other clients",
    where: "Any client that speaks MCP over Streamable HTTP",
    lang: "text",
    code: `URL:     ${ENDPOINT}
Header:  Authorization: Bearer fc-YOUR-KEY
Transport: Streamable HTTP (stateless, JSON responses)`,
  },
];

export type ToolDoc = { name: string; args: string; does: string };
export const TOOLS: ToolDoc[] = [
  {
    name: "find_advertiser",
    args: "query",
    does: "Turns a business name into its website domain, which get_ads needs. Free.",
  },
  {
    name: "get_ads",
    args: "name, domain, platform, country?, filter?, limit?",
    does: "A business's ads on one platform: meta (Facebook and Instagram, with hooks and copy), google (Ads Transparency Center, longest-running first), podcasts (sponsored reads, shows, audio, spend estimate) or creators (TikTok and Instagram posts by views, with cost estimates). filter is running, long_runners or cut_fast, for meta and google.",
  },
  {
    name: "get_meta_ad",
    args: "id",
    does: "One Meta ad's offer, call to action, landing page and video transcript. Works for brands Upspring indexes.",
  },
];

// Real Claude Code runs against the live server (October 2026), answers trimmed.
export type Example = { prompt: string; calls: string[]; answer: string };
export const EXAMPLES: Example[] = [
  {
    prompt: "Which of Factor's Meta ads have run longest, and what hooks do they open with?",
    calls: [
      `find_advertiser(query: "Factor")`,
      `get_ads(name: "Factor", domain: "factor75.com", platform: "meta", filter: "long_runners")`,
    ],
    answer: `The longest runners have been live 220-245 days, all at 5/5 delivery strength: "GLP-1 medication helped me start my weight-loss journey. But Factor made it stick." (245 days), "Want to look toned. Then why are you ignoring fiber?" (242) and "Factor isn't just like every other meal kit. It's a high-protein cheat code." (229). The pattern: protein for fitness audiences, myth-busting and question openers, 86% video, nearly all closing on 50% off the first box.`,
  },
  {
    prompt: "How much is HelloFresh spending on podcast ads, and on which shows?",
    calls: [`get_ads(name: "HelloFresh", domain: "hellofresh.com", platform: "podcasts")`],
    answer: `Roughly $320K-$3.2M, a list-price estimate at $25-50 CPM rather than a reported figure. There are 2,274 ad reads across 523 shows, peaking at 449 reads in September 2026. The top shows by reads are Journey to Truth Podcast Classics (150), Foul Territory (69), The Bobby Bones Show (69) and Hall of Fame with Booker T (57).`,
  },
  {
    prompt:
      "Which creator posts got Liquid Death the most views, and what hooks did they open with?",
    calls: [`get_ads(name: "Liquid Death", domain: "liquiddeath.com", platform: "creators")`],
    answer: `The Croes brothers drove most of the views: @gilmhercroes 1.6M on TikTok, @jayden 820K on Instagram and @jaydencroes 317K, all opening with "Liquid Death X Uncanny Brothers, new KILLBERT GRAPE soda-flavored sparkling water is out!" Next was @its.terrica with 319K ("Roomdadompt never felt better yall!"). None were marked as paid.`,
  },
];

export const AGENT_PROMPT = `Read ${SITE}/llms.txt and set up the adfinder MCP server for me.`;

export function llmsTxt() {
  return `# adfinder

> adfinder finds the ads behind any business: Meta (Facebook and Instagram) and Google ads, podcast sponsorships and TikTok and Instagram creator campaigns, with how long each ad ran. Its MCP server gives an agent that data. It never summarises; the agent's own model does that.

Web app: ${SITE}
Docs for people: ${SITE}/docs
MCP endpoint: ${ENDPOINT} (Streamable HTTP, stateless, JSON responses)

## Set up

Authentication is the user's own Firecrawl API key as a bearer token: \`Authorization: Bearer fc-...\`. Keys come from ${KEYS_URL}. If you are an agent setting this up, ask the user for their key, or use FIRECRAWL_API_KEY from their environment if it is set. Never print the key back.

Without a key, only brands already cached work, including ${FREE_BRANDS}. Firecrawl's keyless mode does not cover the ad data providers, so a brand nobody has looked up needs a key.

${CLIENTS.map((c) => `### ${c.name}\n\n${c.where}:\n\n\`\`\`${c.lang}\n${c.code}\n\`\`\``).join("\n\n")}

To check it works, call find_advertiser with query "HelloFresh". It is free and needs no key.

## Tools

${TOOLS.map((t) => `- ${t.name}(${t.args}): ${t.does}`).join("\n")}

Ad status: "long runner" ran 90+ days (advertisers keep ads that pay off), "cut fast" was stopped within about two weeks. Long-running suggests an ad works; it doesn't prove it.

## Cost

Cached brands are free and instant. A brand nobody has looked up costs roughly 100-200 Firecrawl credits across the four platforms, once, and can take a minute or two; after that it is cached for everyone for up to 30 days (Meta Ad Library results for 3 days).

## Example requests

${EXAMPLES.map((e) => `- ${e.prompt}`).join("\n")}
`;
}
