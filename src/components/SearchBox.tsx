import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Brand } from "../../shared/types";
import { api } from "../api";
import { logo } from "../format";

type Props = {
  value: Brand | null;
  onPick: (b: Brand) => void;
  placeholder?: string;
  compact?: boolean;
  focusOnMount?: boolean;
  submitOnPick?: boolean;
};

// Remount it (key) to reset it to a new value.
export function SearchBox({
  value,
  onPick,
  placeholder = "Search any business",
  compact,
  focusOnMount,
  submitOnPick = true,
}: Props) {
  const [text, setText] = useState(value?.name ?? "");
  const [picked, setPicked] = useState<Brand | null>(value);
  const [found, setFound] = useState<{ q: string; items: Brand[] }>({ q: "", items: [] });
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const q = text.trim();
  const items = q && picked?.name !== text && found.q === q ? found.items : [];

  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    if (!q || picked?.name === text) return;
    const t = setTimeout(() => {
      api<Brand[]>(`/api/suggest?q=${encodeURIComponent(q)}`).then(
        (r) => {
          setFound({ q, items: r });
          setActive(0);
        },
        () => setFound({ q, items: [] }),
      );
    }, 120);
    return () => clearTimeout(t);
  }, [q, text, picked]);

  const choose = (b: Brand) => {
    setPicked(b);
    setText(b.name);
    onPick(b);
    if (submitOnPick) input.current?.blur();
  };
  const submit = () => {
    const top = items[active];
    if (top) choose(top);
    else if (picked && picked.name === text) choose(picked);
    else if (q) choose({ name: q, domain: "" });
  };
  const open = focused && items.length > 0;

  return (
    <div
      className={`search ${compact ? "compact" : ""} ${focused ? "focused" : ""} ${open ? "open" : ""}`}
    >
      <div className="field">
        {picked?.domain && picked.name === text ? (
          <img className="picked" src={logo(picked.domain, 64)} alt="" />
        ) : (
          <Search size={20} className="icon" />
        )}
        <input
          ref={input}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setPicked(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") input.current?.blur();
          }}
        />
        {text && (
          <button
            className="clear"
            aria-label="Clear"
            onClick={() => {
              setText("");
              setPicked(null);
              input.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
        {submitOnPick && (
          <button className="go" onClick={submit} aria-label="Search">
            <ArrowRight size={18} />
          </button>
        )}
      </div>
      {open && (
        <div className="suggest">
          {items.map((b, i) => (
            <button
              key={b.domain || b.name}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(b)}
            >
              <img src={logo(b.domain, 64)} alt="" />
              <span className="nm">{b.name}</span>
              <span className="dm">{b.domain}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
