"use client";
import { useCallback, useEffect, useState } from "react";
import { NotebookService } from "@/lib/api";
import { Notebook } from "@/types";
import NotebookCard from "./NotebookCard";
import DashboardFilters from "./DashboardFilters";
import CreateNotebookModal from "./CreateNotebookModal";
import { useAuth } from "@/context/AuthContext";

const TEMPLATES = [
  { emoji: "📊", title: "Research Paper",   desc: "Analyze academic papers and extract key findings" },
  { emoji: "💼", title: "Meeting Notes",    desc: "Summarize meetings and track action items" },
  { emoji: "📚", title: "Study Guide",      desc: "Turn textbooks and lectures into study materials" },
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
      const nb = await NotebookService.create({ title: tpl.title, emoji: tpl.emoji });
      setNotebooks((prev) => [nb, ...prev]);
    } catch { /* ignore */ } finally {
      setCreatingTemplate(false);
    }
  };

  const filtered = notebooks
    .filter((nb) => {
      if (filter === "mine" && user) return nb.owner_id === user.id;
      return true;
    })
    .filter((nb) => nb.title.toLowerCase().includes(search.toLowerCase()))
    .sort(sort === "alpha" ? (a, b) => a.title.localeCompare(b.title) : () => 0);

  if (loading) {
    return (
      <div className="dash-loading">
        <span className="loading-spinner" />
        <span>Loading notebooks…</span>
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

      <div className={view === "grid" ? "notebook-grid" : "notebook-list"}>
        {/* Create New card */}
        <button
          id="create-notebook-card"
          className="notebook-card notebook-card-new"
          onClick={() => setShowCreate(true)}
        >
          <span className="new-notebook-plus">+</span>
          <span className="new-notebook-label">New notebook</span>
        </button>

        {filtered.map((nb) => (
          <NotebookCard
            key={nb.id}
            notebook={nb}
            onDeleted={handleDeleted}
            onRenamed={handleRenamed}
          />
        ))}
      </div>

      {/* First-run onboarding: show when there are no notebooks at all */}
      {notebooks.length === 0 && !loading && (
        <div className="onboarding-empty">
          <p className="onboarding-heading">👋 Start with a template</p>
          <p className="onboarding-sub">Pick a notebook type to get started, or create a blank one above.</p>
          <div className="onboarding-templates">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.title}
                className="template-card"
                onClick={() => handleTemplate(tpl)}
                disabled={creatingTemplate}
              >
                <span className="template-emoji">{tpl.emoji}</span>
                <span className="template-title">{tpl.title}</span>
                <span className="template-desc">{tpl.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search empty state */}
      {filtered.length === 0 && notebooks.length > 0 && search !== "" && (
        <div className="dash-empty">
          <p className="dash-empty-icon">🔍</p>
          <h3>No results for &ldquo;{search}&rdquo;</h3>
          <p>Try a different search term.</p>
        </div>
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
