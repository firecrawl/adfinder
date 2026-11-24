// Renders the same landing page or dashboard for every direction, so only the stylesheet differs.
const q = new URLSearchParams(location.search);
const page = q.get("page") || "landing";
const dir = q.get("dir") || "a";
document.documentElement.dataset.theme = q.get("theme") || "light";
document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${dir}.css">`);

const B = Object.fromEntries(window.BRANDS.map((b) => [b.name, b]));
const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString("en-US");
const spark = (pts, cls = "spark") => {
  const max = Math.max(...pts, 1), w = 120, h = 32;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}"/></svg>`;
};
const thumb = (a, label = true) =>
  `<figure class="thumb"><img src="${a.thumb}" alt="" loading="eager">${a.video ? '<span class="play">▶</span>' : ""}${
    label && a.days != null ? `<figcaption class="${a.active ? "live" : ""}">${a.active ? "Live · " : ""}${a.days}d</figcaption>` : ""
  }</figure>`;
const logo = (b, size = "") => `<img class="logo ${size}" src="${b.logo}" alt="">`;

const nav = (signedIn) => `
<header class="nav">
  <a class="wordmark" href="#">adfinder<span>.</span></a>
  ${signedIn ? `<div class="nav-search"><span>⌕</span>Search a brand…</div>` : `<nav class="links"><a>Top ads</a><a>For agents</a><a>Docs</a></nav>`}
  <span class="spacer"></span>
  ${signedIn ? `<span class="credits">1.86M credits</span><span class="avatar">R</span>` : `<a class="btn ghost small">Sign in</a>`}
</header>`;

function landing() {
  const ag = B["AG1"];
  const top = ["AG1", "Liquid Death", "Factor", "HelloFresh", "Hungryroot", "AG1", "Liquid Death", "Factor"].map((n, i) => ({ b: B[n], a: B[n].ads[i + 1] }));
  return `${nav(false)}
<main>
  <section class="hero">
    <h1>Every ad behind any business.</h1>
    <p class="lede">Meta and Google ads, podcast sponsorships and creator posts for any brand, with an AI read on what's working.</p>
    <form class="search"><span class="icon">⌕</span><input placeholder="Search a brand, like Olipop or ridge.com" aria-label="Brand"><button class="btn primary">Find ads</button></form>
    <div class="chips"><span>Free to explore:</span>${window.BRANDS.map((b) => `<a class="chip">${logo(b, "xs")}${b.name}</a>`).join("")}</div>
  </section>

  <section class="shot" aria-label="Example: AG1">
    <div class="shot-bar"><span class="dots"><i></i><i></i><i></i></span>adfinder.pandor.cc / AG1</div>
    <div class="shot-body">
      <div class="score">
        <div class="brandrow">${logo(ag, "md")}<div><b>AG1</b><small>drinkag1.com · Greens powder</small></div></div>
        <div class="kpis">
          <div><span>Meta ads running</span><strong>${fmt(ag.metaActive)}</strong></div>
          <div><span>Google ads</span><strong>${ag.googleTotal}</strong></div>
          <div><span>Creator views</span><strong>${fmt(ag.ugcViews)}</strong></div>
        </div>
        <h3>${ag.headline}</h3>
        <ul class="bars">${ag.scores.map((s) => `<li><span>${s.channel}</span><i style="--w:${s.score * 10}%"></i><b>${s.score}</b></li>`).join("")}</ul>
      </div>
      <div class="adstrip">${ag.ads.slice(0, 6).map((a) => thumb(a)).join("")}</div>
    </div>
  </section>

  <section class="proof"><span>Data from</span><b>Upspring</b><b>Google Ads Transparency</b><b>Particle</b><b>Oriane</b><b>Similarweb</b><b>App Store</b><b>BBB</b><b>Firecrawl Trends</b></section>

  <section class="feature">
    <div class="copy"><h2>What's working, not just what's running</h2><p>Hook patterns across a brand's ads and creator posts, how long each ad has run, and which customer complaints its ads ignore.</p></div>
    <div class="panel hooks">${ag.hooks.map((h) => `<div class="hook"><b>${h.name}</b><q>${h.example}</q><span>${h.ads} Meta ads · ${fmt(h.views)} creator views</span></div>`).join("")}</div>
  </section>

  <section class="topads">
    <div class="sechead"><h2>Top ads this week</h2><a>See all</a></div>
    <div class="grid">${top.map(({ b, a }) => `<article class="card">${thumb(a)}<div class="meta">${logo(b, "xs")}<span>${b.name}</span></div></article>`).join("")}</div>
  </section>
</main>`;
}

// Change figures are illustrative: snapshots, which would produce them, don't exist yet.
const SAMPLE = {
  AG1: { delta: [+38, +210, -4], updated: "2 days ago", mine: true },
  Factor: { delta: [+12, +40, +9], updated: "2 days ago" },
  HelloFresh: { delta: [-6, 0, +2], updated: "3 days ago" },
  "Liquid Death": { delta: [+21, +15, +30], updated: "1 day ago" },
  Hungryroot: { delta: [-9, +4, -1], updated: "2 days ago" },
};
const FEED = [
  ["Today", "Liquid Death", "launched 7 Meta ads", "meta"],
  ["Today", "AG1", "search interest down 12% on last month", "trends"],
  ["Yesterday", "Factor", "stopped 5 ads that ran under 2 weeks", "meta"],
  ["Yesterday", "Hungryroot", "new creator post with 1.2M views", "ugc"],
  ["22 Nov", "HelloFresh", "started 3 Google search ads", "google"],
  ["21 Nov", "Factor", "shifted to price-led hooks", "meta"],
];
const delta = (n) => `<em class="${n > 0 ? "up" : n < 0 ? "down" : ""}">${n > 0 ? "+" : ""}${n}</em>`;

function dashboard() {
  const order = ["AG1", "Factor", "HelloFresh", "Liquid Death", "Hungryroot"];
  const card = (n) => {
    const b = B[n], s = SAMPLE[n];
    return `<article class="bcard ${s.mine ? "mine" : ""}">
      <header>${logo(b, "md")}<div><b>${b.name}</b><small>${s.mine ? "Your brand · " : ""}updated ${s.updated}</small></div>${spark(b.trend)}</header>
      <div class="kpis">
        <div><span>Meta ads</span><strong>${fmt(b.metaActive)}</strong>${delta(s.delta[0])}</div>
        <div><span>Google ads</span><strong>${b.googleTotal}</strong>${delta(s.delta[1])}</div>
        <div><span>Creator posts</span><strong>${b.ugcPosts}</strong>${delta(s.delta[2])}</div>
      </div>
      <div class="adstrip small">${b.ads.slice(0, 4).map((a) => thumb(a)).join("")}</div>
      <p class="head">${b.headline}</p>
    </article>`;
  };
  return `${nav(true)}
<main class="dash">
  <div class="dash-head">
    <div><h1>Your brands</h1><p class="digest"><b>Since last week:</b> 46 new ads, 18 stopped, and Factor moved to price-led hooks.</p></div>
    <a class="btn primary">Track a brand</a>
  </div>
  <div class="dash-grid">
    <div class="cards">${order.map(card).join("")}</div>
    <aside class="feed"><h2>What changed</h2><div class="filters"><span class="on">All</span><span>Meta</span><span>Google</span><span>Creators</span></div>
      <ol>${FEED.map(([when, n, what, ch]) => `<li><time>${when}</time>${logo(B[n], "xs")}<p><b>${n}</b> ${what}</p><span class="ch ${ch}">${ch === "ugc" ? "creators" : ch}</span></li>`).join("")}</ol>
    </aside>
  </div>
  <p class="mocknote">Mockup: change figures and the feed are illustrative until snapshots exist. Brand data is real.</p>
</main>`;
}

document.body.innerHTML = page === "dashboard" ? dashboard() : landing();
document.body.className = page;
