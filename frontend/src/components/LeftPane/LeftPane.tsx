"use client";
import { useCallback, useEffect, useState } from "react";
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
  const { documents, selectedDocumentIds, setDocuments } = useAppStore();
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

  const handleDelete = async (id: string) => {
    try {
      await ApiService.deleteDocument(id);
      await loadDocs();
    } catch { /* ignore */ }
  };

  return (
    <aside className="left-pane">
      <div className="pane-header">
        <h2 className="pane-title">
          <span className="pane-icon">📚</span> Sources
        </h2>
        <span className="doc-count">{documents.length}</span>
      </div>

      <div className="left-pane-add">
        <button
          id="add-sources-btn"
          className="add-sources-btn"
          onClick={() => setShowModal(true)}
        >
          + Add Sources
        </button>
      </div>

      {loadError && (
        <p style={{ fontSize: 11, color: "var(--danger)", padding: "6px 14px" }}>
          ⚠ {loadError}
        </p>
      )}

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={`doc-item ${selectedDocumentIds.has(doc.id) ? "selected" : ""}`}>
            <span className="doc-icon">{getIcon(doc.filename)}</span>
            <span className="doc-name" title={doc.filename}>{doc.filename}</span>
            <button className="doc-delete" onClick={() => handleDelete(doc.id)} title="Remove source">✕</button>
          </li>
        ))}
      </ul>

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
