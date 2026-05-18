"use client";
import { useState, useRef, useEffect } from "react";
import { NotebookService } from "@/lib/api";
import { Notebook } from "@/types";

const EMOJI_OPTIONS = ["📓","📔","📒","📕","📗","📘","📙","🗒️","📋","🗂️","🔬","💊","🧬","🏥","⚕️","🧪","💡","🔭","📊","📈"];

interface Props {
  onCreated: (nb: Notebook) => void;
  onClose: () => void;
}

export default function CreateNotebookModal({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📓");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCreate = async () => {
    if (!title.trim()) { setError("Please enter a notebook title."); return; }
    setLoading(true); setError(null);
    try {
      const nb = await NotebookService.create(title.trim(), emoji);
      onCreated(nb);
    } catch {
      setError("Failed to create notebook. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-card" 
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-notebook-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="create-notebook-title">New Notebook</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        <div className="modal-body">
          <label className="form-label">Title</label>
          <input
            id="notebook-title-input"
            className="modal-input"
            placeholder="e.g. Cardiology Research"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />

          <label className="form-label" style={{ marginTop: 16 }}>Icon</label>
          <div className="emoji-grid">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                className={`emoji-btn ${emoji === e ? "selected" : ""}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            id="create-notebook-btn"
            className="action-btn"
            onClick={handleCreate}
            disabled={loading || !title.trim()}
          >
            {loading ? "Creating…" : "Create Notebook"}
          </button>
        </div>
      </div>
    </div>
  );
}
