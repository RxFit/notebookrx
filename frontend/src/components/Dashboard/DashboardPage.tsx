"use client";
import { useCallback, useEffect, useState } from "react";
import { NotebookService } from "@/lib/api";
import { Notebook } from "@/types";
import NotebookCard from "./NotebookCard";
import DashboardFilters from "./DashboardFilters";
import CreateNotebookModal from "./CreateNotebookModal";

export default function DashboardPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "alpha">("recent");

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

  const filtered = notebooks
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

      {filtered.length === 0 && !loading && search === "" && (
        <div className="dash-empty">
          <p className="dash-empty-icon">📓</p>
          <h3>No notebooks yet</h3>
          <p>Create your first notebook to get started.</p>
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
