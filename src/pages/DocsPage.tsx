import { Bot, Check, Copy, KeyRound, Wrench } from "lucide-react";
import { useState } from "react";
import {
  AGENT_PROMPT,
  CLIENTS,
  ENDPOINT,
  EXAMPLES,
  FREE_BRANDS,
  KEYS_URL,
  TOOLS,
} from "../../shared/docs";
import { Card, SectionTitle } from "../components/ui";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn outline copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : label}
    </button>
  );
}

function Code({ text, lang }: { text: string; lang: string }) {
  return (
    <div className="code">
      <div className="code-bar">
        <span>{lang}</span>
        <CopyButton text={text} />
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function DocsPage() {
  const [client, setClient] = useState(CLIENTS[0]!.id);
  const c = CLIENTS.find((x) => x.id === client) ?? CLIENTS[0]!;
  return (
    <main className="page docs">
      <div className="docs-hero">
        <span className="eyebrow">MCP server</span>
        <h1>Every ad behind any business, inside your agent</h1>
        <p>
          Connect Claude Code, Codex, Cursor or any MCP client to adfinder. It finds a business's
          Meta, Google, podcast and creator ads; your agent's own model does the analysis.
        </p>
        <div className="endpoint">
          <code>{ENDPOINT}</code>
          <CopyButton text={ENDPOINT} label="Copy URL" />
        </div>
      </div>

      <div className="agent-callout">
        <span className="ico">
          <Bot size={18} />
        </span>
        <div>
          <b>Let your agent set it up.</b> Paste this into it:
          <p className="quote">{AGENT_PROMPT}</p>
        </div>
        <CopyButton text={AGENT_PROMPT} />
      </div>

      <SectionTitle title="What you can ask" sub="Real runs in Claude Code, answers trimmed" />
      <div className="examples">
        {EXAMPLES.map((e) => (
          <article className="example" key={e.prompt}>
            <div className="ask">
              <span>{e.prompt}</span>
              <CopyButton text={e.prompt} />
            </div>
            <div className="calls">
              {e.calls.map((call) => (
                <code key={call}>
                  <Wrench size={12} />
                  {call}
                </code>
              ))}
            </div>
            <p className="answer">{e.answer}</p>
          </article>
        ))}
      </div>

      <SectionTitle title="Set it up" sub="Replace fc-YOUR-KEY with your Firecrawl API key." />
      <div className="tabs" role="tablist">
        {CLIENTS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === client}
            className={`tab ${x.id === client ? "on" : ""}`}
            onClick={() => setClient(x.id)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <p className="docs-where">{c.where}:</p>
      <Code text={c.code} lang={c.lang} />
      <p className="docs-check">
        To check it works, ask your agent to <i>find HelloFresh with adfinder</i>. That call is free
        and needs no key.
      </p>

      <Card
        className="docs-keys"
        title={
          <span className="with-ico">
            <KeyRound size={15} /> Keys and credits
          </span>
        }
      >
        <div className="prose-sm">
          <p>
            The server runs on your Firecrawl credits, using the key your agent sends. Get one at{" "}
            <a href={KEYS_URL} target="_blank" rel="noreferrer">
              firecrawl.dev
            </a>
            . Brands anyone has already looked up are cached, so they're free and instant. A new
            brand costs about 100–200 credits once, then it's cached for everyone.
          </p>
          <p>
            No key at all? Cached brands still work, including {FREE_BRANDS}. Firecrawl's keyless
            mode doesn't cover the ad data providers, so new brands need a key.
          </p>
          <p>adfinder never runs a language model for MCP calls and never stores your key.</p>
        </div>
      </Card>

      <SectionTitle title="How the tools work" sub="Your agent picks these itself" />
      <div className="tools card">
        {TOOLS.map((t) => (
          <div key={t.name}>
            <code>
              {t.name}({t.args})
            </code>
            <p>{t.does}</p>
          </div>
        ))}
      </div>

      <p className="docs-foot">
        For agents: the full setup is at{" "}
        <a href="/llms.txt">
          <code>/llms.txt</code>
        </a>{" "}
        in plain Markdown.
      </p>
    </main>
  );
}
