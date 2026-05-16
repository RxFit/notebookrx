"use client";
import { useRef, useState } from "react";
import { ApiService } from "@/lib/api";

interface Props {
  notebookId: string;
  onAdded: () => void;
  onClose: () => void;
}

type SourceType = "file" | "text" | "url" | "youtube";

export default function AddSourcesModal({ notebookId, onAdded, onClose }: Props) {
  const [activeType, setActiveType] = useState<SourceType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Paste-text state
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");

  // URL stub state
  const [urlInput, setUrlInput] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage({ text: `Uploading ${file.name}...`, ok: true });
    try {
      const res = await ApiService.uploadDocument(file, notebookId);
      setMessage({ text: `Added ${res.filename} (${res.chunks} chunks)`, ok: true });
      onAdded();
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMessage({ text: detail || "Upload failed", ok: false });
    } finally {
      setUploading(false);
    }
  };

  const handlePasteText = async () => {
    if (!pasteTitle.trim() || !pasteContent.trim()) return;
    setUploading(true);
    try {
      await ApiService.uploadText(pasteTitle.trim(), pasteContent.trim(), notebookId);
      setMessage({ text: "Text added as source!", ok: true });
      onAdded();
      setTimeout(onClose, 1500);
    } catch {
      setMessage({ text: "Failed to add text", ok: false });
    } finally {
      setUploading(false);
    }
  };

  const SOURCE_TYPES: { key: SourceType; icon: string; label: string; stub?: boolean }[] = [
    { key: "file", icon: "📄", label: "File Upload" },
    { key: "text", icon: "📝", label: "Paste Text" },
    { key: "url",  icon: "🔗", label: "Website URL", stub: true },
    { key: "youtube", icon: "▶️", label: "YouTube", stub: false },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Sources</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {!activeType ? (
          <div className="modal-body">
            <p className="modal-hint">Choose how to add a source to this notebook</p>
            <div className="source-type-grid">
              {SOURCE_TYPES.map((t) => (
                <button
                  key={t.key}
                  id={`source-type-${t.key}`}
                  className={`source-type-btn ${t.stub ? "stub" : ""}`}
                  onClick={() => {
                    if (t.stub) { setMessage({ text: `${t.label} coming soon!`, ok: true }); return; }
                    if (t.key === "file") { setActiveType("file"); setTimeout(() => fileRef.current?.click(), 50); }
                    else setActiveType(t.key);
                  }}
                >
                  <span className="source-type-icon">{t.icon}</span>
                  <span className="source-type-label">{t.label}</span>
                  {t.stub && <span className="source-type-badge">Soon</span>}
                </button>
              ))}
            </div>
            {message && (
              <p className="modal-message" style={{ color: message.ok ? "var(--success)" : "var(--danger)" }}>
                {message.text}
              </p>
            )}
          </div>
        ) : activeType === "file" ? (
          <div className="modal-body">
            <input ref={fileRef} type="file" accept=".pdf,.txt,.json,.md" onChange={handleFile} hidden />
            <div
              className="upload-zone upload-zone-large"
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && fileRef.current) {
                  const dt = new DataTransfer(); dt.items.add(file);
                  fileRef.current.files = dt.files;
                  fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }}
            >
              {uploading ? <div className="spinner" /> : (
                <>
                  <div className="upload-icon">📄</div>
                  <p className="upload-text">Drop a file or click to browse</p>
                  <p className="upload-hint">PDF · TXT · JSON · MD — Max 20 MB</p>
                </>
              )}
              {message && <p style={{ color: message.ok ? "var(--success)" : "var(--danger)", fontSize: 12, marginTop: 8 }}>{message.text}</p>}
            </div>
            <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setActiveType(null)}>← Back</button>
          </div>
        ) : activeType === "text" ? (
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input className="modal-input" placeholder="Source title" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
            <textarea
              className="modal-textarea"
              placeholder="Paste your text here..."
              rows={8}
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
            />
            {message && <p style={{ color: message.ok ? "var(--success)" : "var(--danger)", fontSize: 12 }}>{message.text}</p>}
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setActiveType(null)}>← Back</button>
              <button className="action-btn" onClick={handlePasteText} disabled={uploading || !pasteTitle.trim() || !pasteContent.trim()}>
                {uploading ? "Adding..." : "Add as Source"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
