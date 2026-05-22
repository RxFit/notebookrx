"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notebook } from "@/types";
import { NotebookService } from "@/lib/api";

interface Props {
  notebook: Notebook;
  onDeleted: (id: string) => void;
  onRenamed: (nb: Notebook) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function NotebookCard({ notebook, onDeleted, onRenamed }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(notebook.title);
  const [saving, setSaving] = useState(false);

  const openNotebook = () => {
    if (!menuOpen && !editing) router.push(`/notebook/${notebook.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${notebook.title}"? This will remove all its sources.`)) return;
    try {
      await NotebookService.remove(notebook.id);
      onDeleted(notebook.id);
    } catch { /* ignore */ }
    setMenuOpen(false);
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setMenuOpen(false);
  };

  const saveRename = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await NotebookService.update(notebook.id, { title: editTitle.trim() });
      onRenamed(updated);
    } catch { /* ignore */ } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  return (
    <div
      className="notebook-card"
      id={`notebook-${notebook.id}`}
      onClick={openNotebook}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openNotebook();
        }
      }}
    >
      <div className="notebook-card-top">
        <span className="notebook-emoji">
          {/^[a-z_]+$/.test(notebook.emoji) ? <span className="material-symbols-rounded" style={{fontSize: "24px", color: "var(--accent)"}}>{notebook.emoji}</span> : notebook.emoji}
        </span>
        <div style={{ position: "relative" }}>
          <button
            className="notebook-menu-btn"
            id={`notebook-menu-${notebook.id}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            title="More options"
            aria-label={`Options for ${notebook.title}`}
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="notebook-menu-dropdown">
              <button onClick={startRename} style={{display: "flex", alignItems: "center", gap: "6px"}}><span className="material-symbols-rounded" style={{fontSize: "16px"}}>edit</span> Rename</button>
              <button onClick={handleDelete} style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: "6px" }}><span className="material-symbols-rounded" style={{fontSize: "16px"}}>delete</span> Delete</button>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <input
          className="notebook-rename-input"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }}
          onBlur={saveRename}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          disabled={saving}
          aria-label="Rename notebook"
        />
      ) : (
        <h3 className="notebook-title">{notebook.title}</h3>
      )}

      <div className="notebook-meta">
        <span>{notebook.source_count} source{notebook.source_count !== 1 ? "s" : ""}</span>
        <span>{formatDate(notebook.updated_at)}</span>
      </div>
    </div>
  );
}
