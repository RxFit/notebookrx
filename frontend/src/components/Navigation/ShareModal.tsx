"use client";
import { useState, useRef, useEffect } from "react";

interface Props { notebookId: string; onClose: () => void; }

export default function ShareModal({ notebookId, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/notebook/${notebookId}` : "";

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" ref={ref} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">🔗 Share Notebook</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Share this link to give others access to view this notebook (requires sign-in).
          </p>
          <div className="share-url-row">
            <input className="share-url-input" value={url} readOnly id="share-url-input" />
            <button
              id="copy-link-btn"
              className="action-btn"
              onClick={copyLink}
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              {copied ? "✅ Copied!" : "📋 Copy Link"}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}