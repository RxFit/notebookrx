"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { NotebookService } from "@/lib/api";
import { SearchResult } from "@/types";
import { useAppStore } from "@/store/useAppStore";

interface Props { notebookId: string; }

export default function SearchBar({ notebookId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { setHighlightedDocument, setRightTab } = useAppStore();

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await NotebookService.search(notebookId, q);
      setResults(res);
      setOpen(true);
    } catch { setResults([]); } finally { setLoading(false); }
  }, [notebookId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(val), 300);
  }

  function handleSelect(result: SearchResult) {
    setOpen(false); setQuery("");
    if (result.type === "source") {
      setHighlightedDocument(result.id);
    } else {
      setRightTab("notes");
    }
  }

  return (
    <div className="search-bar-wrapper" ref={ref}>
      <div className="search-bar-input-row">
        <span className="search-icon">🔍</span>
        <input
          id="notebook-search"
          className="search-bar-input"
          placeholder="Search sources & notes..."
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && <span className="loading-spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />}
      </div>
      {open && (
        <div className="search-dropdown">
          {results.length === 0 ? (
            <p className="search-no-results">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            results.map((r) => (
              <button key={r.id} className="search-result-item" onClick={() => handleSelect(r)}>
                <span className="search-result-icon">{r.type === "source" ? "📄" : "📝"}</span>
                <span className="search-result-label">{r.label}</span>
                <span className="search-result-sub">{r.subtitle}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}