"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";

export default function LeftPane() {
  const { documents, selectedDocumentIds, setDocuments, toggleDocument, selectAll, deselectAll } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const docs = await ApiService.listDocuments();
      setDocuments(docs);
    } catch (e) {
      console.error("Failed to load documents", e);
    }
  }, [setDocuments]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    try {
      const result = await ApiService.uploadDocument(file);
      setUploadProgress(`✓ ${result.chunks} chunks indexed`);
      await loadDocs();
    } catch (err: any) {
      setUploadProgress(`✗ ${err.response?.data?.detail || "Upload failed"}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(null), 3000);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    await ApiService.deleteDocument(id);
    await loadDocs();
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

      <div className="upload-zone" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.json,.md" onChange={handleUpload} hidden id="file-upload" />
        {uploading ? (
          <div className="upload-spinner"><div className="spinner" /></div>
        ) : (
          <>
            <div className="upload-icon">⬆</div>
            <p className="upload-text">Drop a file or click to upload</p>
            <p className="upload-hint">PDF, TXT, JSON, MD · Max 20MB</p>
          </>
        )}
        {uploadProgress && <p className="upload-progress">{uploadProgress}</p>}
      </div>

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

      {documents.length === 0 && (
        <div className="empty-state">
          <p>No sources yet.</p>
          <p>Upload a document to get started.</p>
        </div>
      )}
    </aside>
  );
}
