"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";

export default function LeftPane() {
  const { documents, selectedDocumentIds, setDocuments, toggleDocument, selectAll, deselectAll } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const docs = await ApiService.listDocuments();
      setDocuments(docs);
      setLoadError(null);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      // 401 is handled globally by the auth interceptor (triggers logout)
      // Only surface other errors
      if (status !== 401) {
        setLoadError("Could not load documents. Is the server reachable?");
      }
    }
  }, [setDocuments]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg({ text: `Uploading ${file.name}…`, ok: true });
    try {
      const result = await ApiService.uploadDocument(file);
      setUploadMsg({ text: `✓ ${result.chunks} chunks indexed from ${result.filename}`, ok: true });
      await loadDocs();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = status === 429
        ? "Rate limit reached — try again in an hour"
        : status === 401
        ? "Session expired — please sign in again"
        : detail || "Upload failed. Check file type (PDF, TXT, JSON, MD)";
      setUploadMsg({ text: `✗ ${msg}`, ok: false });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadMsg(null), 5000);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ApiService.deleteDocument(id);
      await loadDocs();
    } catch (e: unknown) {
      console.error("Delete failed", e);
    }
  };

  const allSelected = documents.length > 0 && documents.every((d) => selectedDocumentIds.has(d.id));

  return (
    <aside className="left-pane">
      <div className="pane-header">
        <h2 className="pane-title">
          <span className="pane-icon">📚</span> Sources
        </h2>
        <span className="doc-count">{documents.length} docs</span>
      </div>

      {/* Upload zone */}
      <div
        id="upload-zone"
        className="upload-zone"
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file && fileRef.current) {
            // Create synthetic change event via DataTransfer
            const dt = new DataTransfer();
            dt.items.add(file);
            fileRef.current.files = dt.files;
            fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }}
      >
        <input
          ref={fileRef}
          type="file"
          id="file-upload"
          accept=".pdf,.txt,.json,.md"
          onChange={handleUpload}
          hidden
        />
        {uploading ? (
          <div className="upload-spinner"><div className="spinner" /></div>
        ) : (
          <>
            <div className="upload-icon">⬆</div>
            <p className="upload-text">Drop a file or click to upload</p>
            <p className="upload-hint">PDF · TXT · JSON · MD — Max 20 MB</p>
          </>
        )}
        {uploadMsg && (
          <p className="upload-progress" style={{ color: uploadMsg.ok ? "var(--success)" : "var(--danger)" }}>
            {uploadMsg.text}
          </p>
        )}
      </div>

      {loadError && (
        <p style={{ fontSize: 11, color: "var(--danger)", padding: "6px 14px" }}>
          ⚠ {loadError}
        </p>
      )}

      {documents.length > 0 && (
        <div className="select-controls">
          <button className="btn-ghost" onClick={allSelected ? deselectAll : selectAll}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="selected-count">{selectedDocumentIds.size} selected</span>
        </div>
      )}

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={`doc-item ${selectedDocumentIds.has(doc.id) ? "selected" : ""}`}>
            <label className="doc-label">
              <input
                type="checkbox"
                className="doc-checkbox"
                id={`doc-${doc.id}`}
                checked={selectedDocumentIds.has(doc.id)}
                onChange={() => toggleDocument(doc.id)}
              />
              <span className="doc-icon">📄</span>
              <span className="doc-name" title={doc.filename}>{doc.filename}</span>
            </label>
            <button className="doc-delete" onClick={() => handleDelete(doc.id)} title="Remove source">✕</button>
          </li>
        ))}
      </ul>

      {documents.length === 0 && !loadError && (
        <div className="empty-state">
          <p>No sources yet.</p>
          <p>Upload a document to get started.</p>
        </div>
      )}
    </aside>
  );
}
