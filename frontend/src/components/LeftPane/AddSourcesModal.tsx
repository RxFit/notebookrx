"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { authStorage } from "@/lib/api";

type SourceType = "url" | "youtube" | "upload" | "text" | "drive";

interface Props {
  notebookId: string;
  onClose: () => void;
  onAdded: () => void;
}

interface Message { text: string; type: "success" | "error" | "info" }
interface DriveFile { id: string; name: string; mimeType: string; modifiedTime?: string }

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://notebookrx-api-production.up.railway.app";

function mimeIcon(mime: string) {
  if (mime.includes("pdf"))    return "picture_as_pdf";
  if (mime.includes("text"))   return "description";
  if (mime.includes("google")) return "article";
  return "insert_drive_file";
}

export default function AddSourcesModal({ notebookId, onClose, onAdded }: Props) {
  // Default to URL (most common entry point for general users)
  const [activeTab, setActiveTab] = useState<SourceType>("url");
  const [message,   setMessage]   = useState<Message | null>(null);
  const [loading,   setLoading]   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver,   setDragOver]  = useState(false);

  const [url,   setUrl]   = useState("");
  const [text,  setText]  = useState("");
  const [title, setTitle] = useState("");

  const [driveFiles,   setDriveFiles]   = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError,   setDriveError]   = useState<string | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());

  const token = authStorage.getToken();

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
      if (!res.ok) throw new Error("Failed to list Drive files");
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (e: unknown) {
      setDriveError((e as Error).message || "Failed to load Drive files");
    } finally {
      setDriveLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "drive" && driveFiles.length === 0 && !driveError) {
      loadDriveFiles();
    }
  }, [activeTab, driveFiles.length, driveError, loadDriveFiles]);

  // --- Upload handler ---
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage(null);
    let successCount = 0;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`${BACKEND}/api/notebooks/${notebookId}/ingest/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        successCount++;
      } catch {
        setMessage({ text: `Failed to upload ${file.name}`, type: "error" });
      }
    }
    if (successCount > 0) {
      setMessage({ text: `${successCount} file(s) added — indexing in background…`, type: "success" });
      onAdded();
    }
    setLoading(false);
  };

  // --- URL / YouTube handler ---
  const handleUrl = async () => {
    if (!url.trim()) return;
    setLoading(true); setMessage(null);
    const isYoutube = activeTab === "youtube";
    try {
      const res = await fetch(`${BACKEND}/api/notebooks/${notebookId}/ingest/${isYoutube ? "youtube" : "url"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || "Ingestion failed");
      }
      setMessage({ text: "Source added — indexing in background…", type: "success" });
      setUrl("");
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally { setLoading(false); }
  };

  // --- Text / Paste handler ---
  const handleText = async () => {
    if (!text.trim()) return;
    setLoading(true); setMessage(null);
    try {
      const res = await fetch(`${BACKEND}/api/notebooks/${notebookId}/ingest/text`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim(), title: title.trim() || "Pasted Text" }),
      });
      if (!res.ok) throw new Error("Text ingestion failed");
      setMessage({ text: "Text added — indexing in background…", type: "success" });
      setText(""); setTitle("");
      onAdded();
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally { setLoading(false); }
  };

  // --- Drive handler ---
  const toggleDriveFile = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleDriveImport = async () => {
    if (selected.size === 0) return;
    setLoading(true); setMessage(null);
    let ok = 0;
    for (const fileId of Array.from(selected)) {
      try {
        const res = await fetch(`${BACKEND}/api/notebooks/${notebookId}/ingest/drive`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileId }),
        });
        if (!res.ok) throw new Error();
        ok++;
      } catch { /* skip failed */ }
    }
    if (ok > 0) {
      setMessage({ text: `${ok} Drive file(s) added — indexing in background…`, type: "success" });
      setSelected(new Set());
      onAdded();
    } else {
      setMessage({ text: "Drive import failed. Try again.", type: "error" });
    }
    setLoading(false);
  };

  // Ordered tabs: URL first (most common), then YouTube, Upload, Paste, Drive
  const TABS: { key: SourceType; label: string; icon: string }[] = [
    { key: "url",     label: "Website",   icon: "language" },
    { key: "youtube", label: "YouTube",   icon: "smart_display" },
    { key: "upload",  label: "Upload",    icon: "upload_file" },
    { key: "text",    label: "Paste Text", icon: "edit_note" },
    { key: "drive",   label: "Drive",     icon: "add_to_drive" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Sources</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="source-modal-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`source-tab-${t.key}`}
              className={`source-modal-tab ${activeTab === t.key ? "active" : ""}`}
              onClick={() => { setActiveTab(t.key); setMessage(null); }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Status message */}
          {message && (
            <p className={message.type === "error" ? "modal-error" : message.type === "success" ? "upload-progress" : "modal-hint"}>
              {message.text}
            </p>
          )}

          {/* Website URL */}
          {activeTab === "url" && (
            <>
              <p className="modal-hint">Paste any public webpage URL — articles, docs, blog posts.</p>
              <input
                id="url-input" className="modal-input"
                placeholder="https://example.com/article"
                value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <button className="action-btn" onClick={handleUrl} disabled={loading || !url.trim()}>
                {loading ? "Adding…" : "Add Website"}
              </button>
            </>
          )}

          {/* YouTube */}
          {activeTab === "youtube" && (
            <>
              <p className="modal-hint">Paste a YouTube video URL to ingest the transcript.</p>
              <input
                id="youtube-input" className="modal-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <button className="action-btn" onClick={handleUrl} disabled={loading || !url.trim()}>
                {loading ? "Adding…" : "Add YouTube Video"}
              </button>
            </>
          )}

          {/* Upload */}
          {activeTab === "upload" && (
            <div
              className={`upload-zone upload-zone-large ${dragOver ? "drag-active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="material-symbols-rounded upload-icon" style={{ fontSize: 36 }}>upload_file</span>
              <p className="upload-text">Drag &amp; drop files here, or click to browse</p>
              <p className="upload-hint">PDF, TXT, MD, JSON supported</p>
              {loading && <p className="upload-progress">Uploading…</p>}
              <input
                ref={fileInputRef} type="file" multiple hidden
                accept=".pdf,.txt,.md,.json"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
          )}

          {/* Paste Text */}
          {activeTab === "text" && (
            <>
              <p className="modal-hint">Paste any text content directly.</p>
              <input
                id="text-title-input" className="modal-input"
                placeholder="Title (optional)"
                value={title} onChange={(e) => setTitle(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <textarea
                id="text-content-input" className="modal-textarea"
                placeholder="Paste your text here…"
                rows={8} value={text} onChange={(e) => setText(e.target.value)}
              />
              <button className="action-btn" onClick={handleText} disabled={loading || !text.trim()}>
                {loading ? "Adding…" : "Add Text"}
              </button>
            </>
          )}

          {/* Google Drive */}
          {activeTab === "drive" && (
            <>
              {driveError && <p className="modal-error">{driveError}</p>}
              {driveLoading && <p className="modal-hint">Loading Drive files…</p>}
              {!driveLoading && !driveError && driveFiles.length === 0 && (
                <p className="modal-hint">No supported files found in your Drive.</p>
              )}
              {driveFiles.map((f) => (
                <label key={f.id} className="drive-file-row">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onChange={() => toggleDriveFile(f.id)}
                  />
                  <span className="material-symbols-rounded" style={{ fontSize: 16, flexShrink: 0 }}>{mimeIcon(f.mimeType)}</span>
                  <span className="drive-file-name">{f.name}</span>
                </label>
              ))}
              {selected.size > 0 && (
                <button className="action-btn" onClick={handleDriveImport} disabled={loading}>
                  {loading ? "Importing…" : `Import ${selected.size} file(s)`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
