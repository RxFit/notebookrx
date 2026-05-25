"use client";
import { useCallback, useEffect, useState } from "react";
import { NotebookService } from "@/lib/api";
import { Notebook } from "@/types";
import NotebookCard from "./NotebookCard";
import DashboardFilters from "./DashboardFilters";
import CreateNotebookModal from "./CreateNotebookModal";
import { useAuth } from "@/context/AuthContext";

/* ─────────────────────────────────────────────────
   Onboarding starter templates — functional + charming
   Each creates a real notebook with a pre-set icon/title.
   ───────────────────────────────────────────────── */
const TEMPLATES = [
  {
    icon: "mic",
    title: "The Podcast Drop",
    tagline: "Generate a podcast nobody asked for (but everyone needs)",
    desc: "Drop your sources. We'll argue about them in stereo.",
    color: "hsl(212, 90%, 60%)",
  },
  {
    icon: "travel_explore",
    title: "The YouTube Rabbit Hole",
    tagline: "Turn YouTube into a conversation",
    desc: "Paste a URL. Watch it become something you can actually talk to.",
    color: "hsl(183, 100%, 45%)",
  },
  {
    icon: "forum",
    title: "Your Sources, Alive",
    tagline: "Your sources, but make them talk back",
    desc: "Upload docs, PDFs, websites. Then interrogate them.",
    color: "hsl(43, 85%, 68%)",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await NotebookService.list();
      setNotebooks(data);
    } catch { /* handled by auth interceptor */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (nb: Notebook) => {
    setNotebooks((prev) => [nb, ...prev]);
    setShowCreate(false);
  };

  const handleDeleted = (id: string) => setNotebooks((prev) => prev.filter((n) => n.id !== id));
  const handleRenamed = (nb: Notebook) => setNotebooks((prev) => prev.map((n) => n.id === nb.id ? nb : n));

  const handleTemplate = async (tpl: typeof TEMPLATES[0]) => {
    setCreatingTemplate(true);
    try {
      const nb = await NotebookService.create(tpl.title, tpl.icon);
      setNotebooks((prev) => [nb, ...prev]);
    } catch { /* ignore */ } finally {
      setCreatingTemplate(false);
    }
  };

  const filtered = notebooks
    .filter((nb) => {
      if (filter === "mine" && user) return nb.owner_id === user.user_id;
      return true;
    })
    .filter((nb) => nb.title.toLowerCase().includes(search.toLowerCase()))
    .sort(sort === "alpha" ? (a, b) => a.title.localeCompare(b.title) : () => 0);

  if (loading) {
    return (
      <div className="dash-loading">
        <span className="loading-spinner" />
        <span>Fetching your notebooks…</span>
      </div>
    );
  }

  return (
    <div className="dash-content">
      <DashboardFilters
        filter={filter} setFilter={setFilter}
        search={search} setSearch={setSearch}
        view={view} setView={setView}
        sort={sort} setSort={setSort}
      />

      {/* ── First-run onboarding ── */}
      {notebooks.length === 0 && !loading && (
        <div className="onboarding-empty">
          <p className="onboarding-heading" style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>
            Nothing here yet. Suspicious.
          </p>
          <p className="onboarding-sub" style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "36px", lineHeight: "1.6" }}>
            Pick a vibe below, or just make a blank notebook and wing it.
          </p>
          <div className="onboarding-templates">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.title}
                className="template-card"
                onClick={() => handleTemplate(tpl)}
                disabled={creatingTemplate}
              >
                <span
                  className="template-icon material-symbols-rounded"
                  style={{ fontSize: "32px", color: tpl.color }}
                >
                  {tpl.icon}
                </span>
                <span className="template-title" style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.3" }}>
                  {tpl.title}
                </span>
                <span style={{ fontSize: "11px", color: tpl.color, fontStyle: "italic", lineHeight: "1.3" }}>
                  {tpl.tagline}
                </span>
                <span className="template-desc" style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", lineHeight: "1.5" }}>
                  {tpl.desc}
                </span>
              </button>
            ))}
          </div>
          <p style={{ marginTop: "28px", fontSize: "12px", color: "var(--text-muted)" }}>
            or{" "}
            <button
              onClick={() => setShowCreate(true)}
              style={{ background: "none", border: "none", color: "var(--accent)", textDecoration: "underline", cursor: "pointer", fontSize: "12px" }}
            >
              start from scratch
            </button>
          </p>
        </div>
      )}

      {/* ── Notebook grid / list ── */}
      {notebooks.length > 0 && (
        <div className={view === "grid" ? "notebook-grid" : "notebook-list"}>
          {/* Create New card — only in grid view */}
          {view === "grid" && (
            <button
              id="create-notebook-card"
              className="notebook-card notebook-card-new"
              onClick={() => setShowCreate(true)}
            >
              <span className="new-notebook-plus">+</span>
              <span className="new-notebook-label">New notebook</span>
            </button>
          )}

          {filtered.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              onDeleted={handleDeleted}
              onRenamed={handleRenamed}
            />
          ))}
        </div>
      )}

      {/* ── Search empty state ── */}
      {filtered.length === 0 && notebooks.length > 0 && search !== "" && (
        <div className="dash-empty" style={{ textAlign: "center", padding: "48px 0" }}>
          <p className="dash-empty-icon material-symbols-rounded" style={{ fontSize: "36px", color: "var(--text-muted)", marginBottom: "16px" }}>search_off</p>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Nothing matches &ldquo;{search}&rdquo;</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Try something less specific. Or more specific. We&rsquo;re not your search coach.</p>
        </div>
      )}

      {/* ── Mobile FAB — only shown when notebooks exist ── */}
      {notebooks.length > 0 && (
        <button
          className="mobile-fab"
          onClick={() => setShowCreate(true)}
          aria-label="Create new notebook"
          title="New notebook"
        >
          <span className="material-symbols-rounded" style={{ fontSize: "26px" }}>add</span>
        </button>
      )}

      {showCreate && (
        <CreateNotebookModal
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
