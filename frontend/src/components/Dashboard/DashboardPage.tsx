"use client";
import { useCallback, useEffect, useState } from "react";
import { NotebookService } from "@/lib/api";
import { Notebook } from "@/types";
import NotebookCard from "./NotebookCard";
import DashboardFilters from "./DashboardFilters";
import CreateNotebookModal from "./CreateNotebookModal";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const TEMPLATES = [
  { icon: "analytics", title: "KPI Dashboard",   desc: "Analyze executive metrics and extract key findings" },
  { icon: "summarize", title: "Executive Brief",    desc: "Summarize strategic alignments and action items" },
  { icon: "biotech", title: "Biological Asset Mgt",      desc: "Turn clinical data into actionable insights" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
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
    router.push("/notebook/" + nb.id);
  };

  const handleDeleted = (id: string) => setNotebooks((prev) => prev.filter((n) => n.id !== id));
  const handleRenamed = (nb: Notebook) => setNotebooks((prev) => prev.map((n) => n.id === nb.id ? nb : n));

  const handleTemplate = async (tpl: typeof TEMPLATES[0]) => {
    setCreatingTemplate(true);
    try {
      const nb = await NotebookService.create(tpl.title, tpl.icon);
      setNotebooks((prev) => [nb, ...prev]);
      router.push("/notebook/" + nb.id);
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
        <div className="onboarding-empty" style={{ padding: "40px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-surface)", textAlign: "center" }}>
          <p className="onboarding-heading" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Initialize Workspace</p>
          <p className="onboarding-sub" style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px" }}>Select a module framework to proceed, or instantiate a blank module.</p>
          <div className="onboarding-templates" style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.title}
                className="template-card"
                onClick={() => handleTemplate(tpl)}
                disabled={creatingTemplate}
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "8px", padding: "24px 16px", width: "220px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", cursor: "pointer" }}
              >
                <span className="template-icon material-symbols-rounded" style={{ fontSize: "28px", color: "var(--accent)" }}>{tpl.icon}</span>
                <span className="template-title" style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-primary)" }}>{tpl.title}</span>
                <span className="template-desc" style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", lineHeight: "1.4" }}>{tpl.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search empty state */}
      {filtered.length === 0 && notebooks.length > 0 && search !== "" && (
        <div className="dash-empty" style={{ textAlign: "center", padding: "48px 0" }}>
          <p className="dash-empty-icon material-symbols-rounded" style={{ fontSize: "32px", color: "var(--text-muted)", marginBottom: "16px" }}>search_off</p>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>No constraints matched &ldquo;{search}&rdquo;</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Modify query parameters to continue.</p>
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
