"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { authStorage } from "@/lib/api";

type SourceType = "upload" | "url" | "youtube" | "text" | "drive";

interface Props {
  notebookId: string;
  onClose: () => void;
  onAdded: () => void;          // called after any successful source ingestion
}

interface Message { text: string; type: "success" | "error" | "info" }
interface DriveFile { id: string; name: string; mimeType: string; modifiedTime?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────
const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://notebookrx-api-production.up.railway.app";

function mimeIcon(mime: string) {
  if (mime.includes("pdf"))    return "picture_as_pdf";
  if (mime.includes("text"))   return "description";
  if (mime.includes("google")) return "article";
  return "insert_drive_file";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AddSourcesModal({ notebookId, onClose, onAdded }: Props) {
  const [activeTab, setActiveTab] = useState<SourceType>("upload");
  const [message,   setMessage]   = useState<Message | null>(null);
  const [loading,   setLoading]   = useState(false);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver,   setDragOver]  = useState(false);

  // URL/YouTube/Text state
  const [url,   setUrl]   = useState("");
  const [text,  setText]  = useState("");
  const [title, setTitle] = useState("");

  // Drive state
  const [driveFiles,   setDriveFiles]   = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError,   setDriveError]   = useState<string | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());

  const token = authStorage.getToken();

  // ── Drive file list ──────────────────────────────────────────────────────────
  const loadDriveFiles = useCallback(async () => {
    setDriveLoading(true);
    setDriveError(null);
    try {
      const res = await fetch(`${BACKEND}/api/ingest/drive/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setDriveError("Drive access not authorised — please sign in with Google first.");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setDriveFiles(await res.json());
    } catch (e: unknown) {
      setDriveError((e as Error).message || "Failed to load Drive files.");
    } finally {
      setDriveLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "drive" && token) loadDriveFiles();
  }, [activeTab, token, loadDriveFiles]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const ingestDriveFiles = async () => {
    if (!selected.size) return;
    setLoading(true);
    setMessage(null);
    let success = 0;
    for (const fileId of selected) {
      try {
        const res = await fetch(`${BACKEND}/api/ingest/drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ file_id: fileId, notebook_id: notebookId }),
        });
        if (!res.ok) throw new Error(await res.text());
        success++;
      } catch { /* individual failures don't abort batch */ }
    }
    setLoading(false);
    setSelected(new Set());
    if (success > 0) {
      setMessage({ text: `${success} file${success > 1 ? "s" : ""} added — processing…`, type: "success" });
      onAdded();
    } else {
      setMessage({ text: "Failed to add Drive files.", type: "error" });
    }
  };

  // ── Upload handler ────────────────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setLoading(true);
    setMessage(null);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("file", f));
    formData.append("notebook_id", notebookId);
    try {
      const res = await fetch(`${BACKEND}/api/ingest/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ text: "File added — processing…", type: "success" });
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message || "Upload failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ── URL handler ───────────────────────────────────────────────────────────────
  const handleUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("url", url);
      form.append("notebook_id", notebookId);
      const res = await fetch(`${BACKEND}/api/ingest/url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setUrl("");
      setMessage({ text: "Website added — processing…", type: "success" });
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message || "URL ingestion failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ── YouTube handler ───────────────────────────────────────────────────────────
  const handleYouTube = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("youtube_url", url);
      form.append("notebook_id", notebookId);
      const res = await fetch(`${BACKEND}/api/ingest/youtube`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setUrl("");
      setMessage({ text: "YouTube transcript added — processing…", type: "success" });
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message || "YouTube ingestion failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ── Text paste handler ────────────────────────────────────────────────────────
  const handleText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("title", title || "Pasted text");
      form.append("content", text);
      form.append("notebook_id", notebookId);
      const res = await fetch(`${BACKEND}/api/ingest/text`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setText("");
      setTitle("");
      setMessage({ text: "Text added — processing…", type: "success" });
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message || "Text ingestion failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const TABS: { key: SourceType; label: string; icon: string }[] = [
    { key: "upload",  label: "Upload",  icon: "upload_file" },
    { key: "url",     label: "Website", icon: "language" },
    { key: "youtube", label: "YouTube", icon: "smart_display" },
    { key: "text",    label: "Paste",   icon: "edit_note" },
    { key: "drive",   label: "Drive",   icon: "add_to_drive" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Add Sources</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <p className="modal-subtitle">Choose how to add a source to this notebook</p>

        {/* Tabs */}
        <div className="source-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`source-tab${activeTab === t.key ? " active" : ""}`}
              onClick={() => { setActiveTab(t.key); setMessage(null); }}
            >
              <span className="material-symbols-rounded">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="source-tab-content">

          {/* ── Upload ── */}
          {activeTab === "upload" && (
            <div
              className={`drop-zone${dragOver ? " drag-over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              <span className="material-symbols-rounded drop-icon">cloud_upload</span>
              <p className="drop-label">Drop a file or click to browse</p>
              <p className="drop-hint">PDF · TXT · JSON · MD — Max 20 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.json,.md"
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* ── Website URL ── */}
          {activeTab === "url" && (
            <div className="source-form">
              <label className="source-label">Website URL</label>
              <input
                className="source-input"
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <button className="source-submit" onClick={handleUrl} disabled={loading || !url.trim()}>
                {loading ? <span className="loading-spinner-sm" /> : "Add Website"}
              </button>
            </div>
          )}

          {/* ── YouTube ── */}
          {activeTab === "youtube" && (
            <div className="source-form">
              <label className="source-label">YouTube URL</label>
              <input
                className="source-input"
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleYouTube()}
              />
              <button className="source-submit" onClick={handleYouTube} disabled={loading || !url.trim()}>
                {loading ? <span className="loading-spinner-sm" /> : "Add YouTube Transcript"}
              </button>
            </div>
          )}

          {/* ── Paste Text ── */}
          {activeTab === "text" && (
            <div className="source-form">
              <label className="source-label">Title (optional)</label>
              <input
                className="source-input"
                type="text"
                placeholder="My notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label className="source-label" style={{ marginTop: 8 }}>Content</label>
              <textarea
                className="source-textarea"
                placeholder="Paste text content here…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
              />
              <button className="source-submit" onClick={handleText} disabled={loading || !text.trim()}>
                {loading ? <span className="loading-spinner-sm" /> : "Add Text"}
              </button>
            </div>
          )}

          {/* ── Google Drive ── */}
          {activeTab === "drive" && (
            <div className="drive-picker">
              <div className="drive-picker-header">
                <span className="drive-picker-hint">
                  Select files from your Google Drive to import as sources.
                </span>
                <button className="drive-refresh-btn" onClick={loadDriveFiles} disabled={driveLoading} title="Refresh">
                  <span className={`material-symbols-rounded${driveLoading ? " spin" : ""}`}>refresh</span>
                </button>
              </div>

              {driveError && (
                <div className="drive-error">
                  <span className="material-symbols-rounded">error_outline</span>
                  {driveError}
                  {driveError.includes("sign in") && (
                    <a href={`${BACKEND}/auth/google`} className="drive-reauth-link">
                      Sign in with Google
                    </a>
                  )}
                </div>
              )}

              {driveLoading && (
                <div className="drive-loading">
                  <span className="loading-spinner" />
                  <span>Loading Drive files…</span>
                </div>
              )}

              {!driveLoading && !driveError && driveFiles.length === 0 && (
                <div className="drive-empty">
                  <span className="material-symbols-rounded" style={{ fontSize: 40 }}>folder_open</span>
                  <p>No compatible files found in your Drive.</p>
                  <p className="drive-empty-hint">PDFs, Google Docs, and plain text files are supported.</p>
                </div>
              )}

              {!driveLoading && driveFiles.length > 0 && (
                <ul className="drive-file-list">
                  {driveFiles.map((f) => (
                    <li
                      key={f.id}
                      className={`drive-file-item${selected.has(f.id) ? " selected" : ""}`}
                      onClick={() => toggleSelect(f.id)}
                    >
                      <span className="material-symbols-rounded drive-file-icon">{mimeIcon(f.mimeType)}</span>
                      <span className="drive-file-name">{f.name}</span>
                      {selected.has(f.id) && (
                        <span className="material-symbols-rounded drive-check">check_circle</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {selected.size > 0 && (
                <button
                  className="source-submit"
                  onClick={ingestDriveFiles}
                  disabled={loading}
                  style={{ marginTop: 12 }}
                >
                  {loading
                    ? <span className="loading-spinner-sm" />
                    : `Import ${selected.size} file${selected.size > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status message */}
        {message && (
          <div className={`source-message source-message--${message.type}`}>
            <span className="material-symbols-rounded">
              {message.type === "success" ? "check_circle" : message.type === "error" ? "error" : "info"}
            </span>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
