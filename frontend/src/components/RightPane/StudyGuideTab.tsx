"use client";
import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { StudyGuide } from "@/types";

export default function StudyGuideTab() {
  const { selectedDocumentIds, documents } = useAppStore();
  const [guide, setGuide] = useState<StudyGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openQ, setOpenQ] = useState<number | null>(null);

  const docIds = selectedDocumentIds.size > 0 ? Array.from(selectedDocumentIds) : documents.map((d) => d.id);
  const noSources = documents.length === 0;

  async function generate() {
    if (noSources) return;
    setLoading(true); setError(""); setGuide(null); setOpenQ(null);
    try {
      const res = await ApiService.generateStudyGuide(docIds);
      setGuide(res);
    } catch { setError("Failed to generate study guide. Please try again."); } finally { setLoading(false); }
  }

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">🎓 Study Guide</h3>
      <p className="tab-desc">Generate key concepts, definitions, and practice Q&amp;A from your sources.</p>
      <button id="studyguide-btn" className="action-btn" onClick={generate} disabled={loading || noSources} style={{ marginBottom: 14 }}>
        {loading ? <><span className="loading-spinner" style={{ width: 12, height: 12 }} /> Generating...</> : "✨ Generate Study Guide"}
      </button>
      {noSources && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Add sources first.</p>}
      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}
      {guide && (
        <div className="study-guide">
          <h4 className="study-guide-title">{guide.title}</h4>

          {guide.sections.map((sec, i) => (
            <div key={i} className="study-section">
              <h5 className="study-section-heading">{sec.heading}</h5>
              <p className="study-section-content">{sec.content}</p>
            </div>
          ))}

          {guide.questions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="tab-section-title" style={{ marginBottom: 8 }}>Practice Questions</p>
              {guide.questions.map((q, i) => (
                <div key={i} className="study-qa">
                  <button
                    className="study-q-btn"
                    onClick={() => setOpenQ(openQ === i ? null : i)}
                  >
                    <span className="study-q-text">Q{i + 1}. {q.q}</span>
                    <span className="study-q-chevron">{openQ === i ? "▲" : "▼"}</span>
                  </button>
                  {openQ === i && (
                    <div className="study-answer">
                      <strong>A:</strong> {q.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}