import { ChevronDown, ExternalLink, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, signInUrl } from "../api";
import { compact, timeAgo } from "../format";
import { useRecent, visitId, visitTitle, type Visit } from "../recent";
import { VisitLogos } from "./VisitCard";
import { useSession } from "../session";

export function AccountButton({ onOpen }: { onOpen: (v: Visit) => void }) {
  const { me, refresh, openSignIn } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const recent = useRecent();

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!me) return null;
  if (!me.connected) {
    return (
      <button className="btn" onClick={() => openSignIn()}>
        <img src="/firecrawl.svg" alt="" />
        <span>
          Sign in<span className="wide-only"> with Firecrawl</span>
        </span>
      </button>
    );
  }
  const team = me.teamName ?? "Firecrawl";
  return (
    <div className="usermenu" ref={box}>
      <button
        className="account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{compact(me.remainingCredits)} credits</span>
        <span className="avatar">{team.slice(0, 1).toUpperCase()}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who">
            <span className="avatar lg">{team.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{team}</b>
              <small>Signed in with Firecrawl</small>
            </div>
          </div>
          <div className="credits">
            <span>Credits remaining</span>
            <b>{(me.remainingCredits ?? 0).toLocaleString("en-US")}</b>
          </div>
          {recent.length > 0 && (
            <div className="section">
              <small>Recent searches</small>
              {recent.slice(0, 5).map((v) => (
                <button
                  key={visitId(v)}
                  role="menuitem"
                  className="item"
                  onClick={() => {
                    setOpen(false);
                    onOpen(v);
                  }}
                >
                  <VisitLogos visit={v} size={32} />
                  <span>{visitTitle(v)}</span>
                  <small>{timeAgo(v.at)}</small>
                </button>
              ))}
            </div>
          )}
          <div className="section">
            <a
              role="menuitem"
              className="item"
              href="https://www.firecrawl.dev/app"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              <span>Manage account and billing</span>
            </a>
            <button
              role="menuitem"
              className="item"
              onClick={() => {
                setOpen(false);
                void api("/api/auth/logout", {}).then(refresh);
              }}
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SignInModal({ mode, onClose }: { mode: "signin" | "key"; onClose: () => void }) {
  const { refresh } = useSession();
  const [view, setView] = useState(mode);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");

  // Firecrawl's browser sign-in (the flow its CLI uses): open firecrawl.dev/cli-auth with a PKCE challenge,
  // then poll the Worker, which stores the key in its cookie, so the page only learns that sign-in finished.
  useEffect(() => {
    if (view !== "signin") return;
    let cancelled = false;
    void (async () => {
      const { session, verifier, url } = await signInUrl();
      window.open(url, "adfinder-auth", "width=520,height=720");
      const until = Date.now() + 10 * 60_000;
      while (!cancelled && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await api<{ status: string }>("/api/auth/poll", {
          session_id: session,
          code_verifier: verifier,
        }).catch(() => null);
        if (r?.status === "complete" && !cancelled) {
          await refresh();
          onClose();
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, refresh, onClose]);

  const saveKey = async () => {
    setErr("");
    try {
      await api("/api/auth/key", { apiKey: key.trim() });
      await refresh();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <dialog open className="modal" aria-modal="true">
        <img className="mk" src="/firecrawl.svg" alt="" />
        {view === "signin" ? (
          <>
            <h3>Finish signing in</h3>
            <p>
              Sign in or create a free account in the Firecrawl window. This updates by itself when
              you're done.
            </p>
            <div className="status">
              <span className="spin" />
              Waiting for Firecrawl…
            </div>
            <button className="linkish" onClick={() => setView("key")}>
              Use an API key instead
            </button>
          </>
        ) : (
          <>
            <h3>Connect an API key</h3>
            <p>
              Paste a Firecrawl API key. It's kept in an encrypted cookie that this page can't read.
            </p>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="fc-…"
              aria-label="Firecrawl API key"
              onKeyDown={(e) => e.key === "Enter" && void saveKey()}
            />
            {err && <div className="err">{err}</div>}
            <button className="btn fire" onClick={() => void saveKey()} disabled={!key.trim()}>
              Connect
            </button>
          </>
        )}
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </dialog>
    </>
  );
}
