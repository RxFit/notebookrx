"use client";
import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";

export default function SummarizeTab() {
  const { selectedDocumentIds, documents } = useAppStore();
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const docIds = selectedDocumentIds.size > 0 ? Array.from(selectedDocumentIds) : documents.map((d) => d.id);
  const noSources = documents.length === 0;

  async function generate() {
    if (noSources) return;
    setLoading(true); setError(""); setSummary("");
    try {
      const res = await ApiService.summarizeSources(docIds);
      setSummary(res.summary);
    } catch { setError("Failed to generate summary. Please try again."); } finally { setLoading(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(summary);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">📋 Summary</h3>
      <p className="tab-desc">Generate a concise executive summary of your selected sources.</p>
      <button id="summarize-btn" className="action-btn" onClick={generate} disabled={loading || noSources} style={{ marginBottom: 14 }}>
        {loading ? <><span className="loading-spinner" style={{ width: 12, height: 12 }} /> Generating...</> : "✨ Summarize Sources"}
      </button>
      {noSources && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Add sources first to enable summarization.</p>}
      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}
      {summary && (
        <div className="summary-result">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={copy}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
          </div>
          <div className="summary-text">{summary}</div>
        </div>
      )}
    </div>
  );
}