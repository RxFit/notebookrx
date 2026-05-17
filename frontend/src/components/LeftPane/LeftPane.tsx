"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import AddSourcesModal from "./AddSourcesModal";

interface Props { notebookId: string; }

const DOC_ICON: Record<string, string> = {
  pdf: "📄", txt: "📝", json: "🗂️", md: "📋",
};

function getIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return DOC_ICON[ext] || "📄";
}

export default function LeftPane({ notebookId }: Props) {
  const {
    documents,
    selectedDocumentIds,
    setDocuments,
    toggleDocument,
    selectAll,
    deselectAll,
  } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const docs = await ApiService.listDocuments(notebookId);
      setDocuments(docs);
      setLoadError(null);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status !== 401) setLoadError("Could not load sources.");
    }
  }, [notebookId, setDocuments]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = async (id: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${filename}"? It will no longer be available in chat.`)) return;
    try {
      await ApiService.deleteDocument(id);
      await loadDocs();
    } catch { /* ignore */ }
  };

  const allSelected = documents.length > 0 && documents.every((d) => selectedDocumentIds.has(d.id));
  const noneSelected = selectedDocumentIds.size === 0;
  const selectedCount = selectedDocumentIds.size;

  return (
    <aside className="left-pane">
      {/* ── Header ── */}
      <div className="pane-header">
        <h2 className="pane-title">
          <span className="pane-icon">📚</span> Sources
        </h2>
        <span className="doc-count">{documents.length}</span>
      </div>

      {/* ── Add Sources CTA ── */}
      <div className="left-pane-add">
        <button
          id="add-sources-btn"
          className="add-sources-btn"
          onClick={() => setShowModal(true)}
        >
          + Add Sources
        </button>
      </div>

      {/* ── Selection controls (only shown when there are docs) ── */}
      {documents.length > 0 && (
        <div className="source-select-bar">
          <span className="source-select-hint">
            {noneSelected
              ? "No sources selected"
              : allSelected
              ? "All sources selected"
              : `${selectedCount} of ${documents.length} selected`}
          </span>
          <div className="source-select-actions">
            <button
              className="source-select-btn"
              onClick={allSelected ? deselectAll : selectAll}
              title={allSelected ? "Deselect all" : "Select all"}
            >
              {allSelected ? "None" : "All"}
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <p style={{ fontSize: 11, color: "var(--danger)", padding: "6px 14px" }}>
          ⚠ {loadError}
        </p>
      )}

      {/* ── Source list — click to toggle ── */}
      <ul className="doc-list">
        {documents.map((doc) => {
          const isSelected = selectedDocumentIds.has(doc.id);
          return (
            <li
              key={doc.id}
              id={`source-${doc.id}`}
              className={`doc-item source-item ${isSelected ? "selected" : "unselected"}`}
              onClick={() => toggleDocument(doc.id)}
              title={isSelected ? `Deselect "${doc.filename}"` : `Select "${doc.filename}"`}
            >
              <span className={`source-check ${isSelected ? "source-check-on" : ""}`}>
                {isSelected ? "✓" : ""}
              </span>
              <span className="doc-icon">{getIcon(doc.filename)}</span>
              <span className="doc-name" title={doc.filename}>{doc.filename}</span>
              <button
                className="doc-delete"
                onClick={(e) => handleDelete(doc.id, doc.filename, e)}
                title="Remove source"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {/* ── Scope hint at bottom (only shown when mixed selection) ── */}
      {documents.length > 0 && !noneSelected && !allSelected && (
        <p className="source-scope-hint">
          Chat &amp; Studio will use only the {selectedCount} selected source{selectedCount !== 1 ? "s" : ""}.
        </p>
      )}
      {documents.length > 0 && noneSelected && (
        <p className="source-scope-hint source-scope-warn">
          ⚠ No sources selected — select at least one to enable chat.
        </p>
      )}

      {documents.length === 0 && !loadError && (
        <div className="empty-state">
          <p>No sources yet.</p>
          <p>Click &ldquo;Add Sources&rdquo; to get started.</p>
        </div>
      )}

      {showModal && (
        <AddSourcesModal
          notebookId={notebookId}
          onAdded={loadDocs}
          onClose={() => setShowModal(false)}
        />
      )}
    </aside>
  );
}
