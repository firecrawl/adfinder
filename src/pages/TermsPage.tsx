export function TermsPage() {
  return (
    <main className="page docs terms">
      <div className="docs-hero">
        <span className="eyebrow">Terms & privacy</span>
        <h1>Using Ad Finder</h1>
        <p>Last updated 24 November 2026.</p>
      </div>
      <div className="prose-sm">
        <h2>What Ad Finder is</h2>
        <p>
          Ad Finder shows the ads, sponsorships and creator posts behind a business, using public
          data that Firecrawl Alexandria's data providers return. It's a free demo. Results can be
          incomplete, out of date or wrong, and estimates (such as spend) are rough. Don't rely on
          them for financial, legal or business decisions.
        </p>

        <h2>Your Firecrawl account</h2>
        <p>
          Researching a brand that isn't cached runs Firecrawl Alexandria calls on your own
          Firecrawl account and uses its credits. Your use of Firecrawl is governed by{" "}
          <a href="https://www.firecrawl.dev/terms-of-service" target="_blank" rel="noreferrer">
            Firecrawl's terms of service
          </a>
          .
        </p>

        <h2>Third-party data</h2>
        <p>
          The data shown here comes from third-party providers and is subject to their terms, listed
          on{" "}
          <a
            href="https://www.firecrawl.dev/terms/third-party-data"
            target="_blank"
            rel="noreferrer"
          >
            Firecrawl's Third-Party Data Terms
          </a>
          . By using Ad Finder you agree to use the data only to view it here, for your own
          research. In particular, you may not:
        </p>
        <ul>
          <li>
            copy, store or reuse website traffic figures (from Similarweb), or put them in a
            database, dataset or search index;
          </li>
          <li>bulk download, export, scrape or feed any of the data into another product;</li>
          <li>use the data to build a product that competes with a provider's own;</li>
          <li>use it to train or fine-tune an AI model;</li>
          <li>remove or change any attribution shown with the data.</li>
        </ul>
        <p>
          Ads, logos and trademarks belong to their owners. Ad Finder shows them only to describe
          the advertising.
        </p>

        <h2>What we store</h2>
        <p>
          <b>Your Firecrawl API key</b> is kept in an encrypted, HttpOnly cookie in your browser.
          The page's scripts can't read it, and we don't store it anywhere else. Signing out deletes
          it.
        </p>
        <p>
          <b>Research results</b> are cached on Cloudflare for up to 3 days (4 for the featured
          brands), so a brand loads faster the next time. Podcast data (from Particle) and website
          traffic (from Similarweb) are never stored: they're fetched with your own key each time
          you view them, and only your browser keeps them, until you leave the page.
        </p>
        <p>
          <b>Usage events</b>: which channel or analysis ran, for which brand, whether it came from
          the cache, how long it took and how many credits it used. They contain no API keys, names,
          emails or IP addresses.
        </p>
        <p>
          <b>Site analytics</b> go to PostHog (EU servers): pages viewed, the brands searched,
          which tabs are opened, sign-in started or finished, how long each channel and analysis
          took to load, and page-speed measurements. PostHog keeps nothing in your browser (no
          cookies or local storage), so a visit can't be linked to your next one. It never receives
          your API key or anything typed into the sign-in form, and sessions aren't recorded.
        </p>
        <p>
          <b>Recently viewed brands</b> are kept in your browser's local storage only.
        </p>
        <p>
          AI summaries are written by a language model through OpenRouter, which receives the
          research data for the brand, never your API key.
        </p>
      </div>
    </main>
  );
}
