"use client";
import { useState, useEffect, useRef } from "react";
import { NotebookService } from "@/lib/api";

interface Props { notebookId: string; currentPrompt?: string; onClose: () => void; onSaved: (prompt: string) => void; }

export default function CustomizeModal({ notebookId, currentPrompt, onClose, onSaved }: Props) {
  const [prompt, setPrompt] = useState(currentPrompt || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      await NotebookService.update(notebookId, { system_prompt: prompt });
      onSaved(prompt);
      onClose();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" ref={ref} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 className="modal-title">✏️ Customize Notebook</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Set a custom system prompt for this notebook. This overrides the default RAG instructions and shapes how the AI responds to all queries in this notebook.
          </p>
          <textarea
            className="modal-textarea"
            placeholder="e.g. You are a medical research assistant. Focus on clinical outcomes and cite studies precisely. Always recommend consulting a licensed physician."
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ resize: "vertical" }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Leave blank to use the default NotebookRx retrieval prompt.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="action-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}