"use client";
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { MediaJob } from "@/types";
import dynamic from "next/dynamic";

const Mermaid = dynamic(() => import("react-mermaid2"), { ssr: false });

function AudioTab() {
  const { selectedDocumentIds } = useAppStore();
  const [job, setJob] = useState<MediaJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const startGeneration = async () => {
    if (selectedDocumentIds.size === 0) return;
    const res = await ApiService.startAudioJob(Array.from(selectedDocumentIds));
    setJobId(res.job_id);
    setPolling(true);
    setJob({ status: "queued", progress: 0, url: null, error: null });
  };

  useEffect(() => {
    if (!polling || !jobId) return;
    pollRef.current = setInterval(async () => {
      const status = await ApiService.getJobStatus(jobId);
      setJob(status);
      if (status.status === "done" || status.status === "error") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, jobId]);

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">🎙 Podcast Generator</h3>
      <p className="tab-desc">Generate a 2-host podcast conversation from your selected sources.</p>
      <button id="generate-audio-btn" className="action-btn" onClick={startGeneration} disabled={polling || selectedDocumentIds.size === 0}>
        {polling ? "Generating…" : "Generate Podcast"}
      </button>
      {job && (
        <div className="job-status">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          <p className="job-label">{job.status} — {job.progress}%</p>
          {job.error && <p className="job-error">✗ {job.error}</p>}
          {job.url && (
            <div className="audio-result">
              <audio controls src={job.url} className="audio-player" />
              <a href={job.url} download className="btn-ghost">Download MP3</a>
            </div>
          )}
          {job.script && (
            <div className="script-preview">
              {job.script.map((line, i) => (
                <div key={i} className={`script-line ${line.speaker === "Host A" ? "host-a" : "host-b"}`}>
                  <strong>{line.speaker}:</strong> {line.dialogue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagramTab() {
  const { selectedDocumentIds } = useAppStore();
  const [prompt, setPrompt] = useState("");
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (selectedDocumentIds.size === 0) return;
    setLoading(true); setError(null);
    try {
      const res = await ApiService.generateDiagram(Array.from(selectedDocumentIds), prompt);
      setMermaid(res.mermaid);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">📊 Diagram Generator</h3>
      <input id="diagram-prompt" className="diagram-input" placeholder="Optional: describe the diagram you want…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button id="generate-diagram-btn" className="action-btn" onClick={generate} disabled={loading || selectedDocumentIds.size === 0}>
        {loading ? "Generating…" : "Generate Diagram"}
      </button>
      {error && <p className="job-error">✗ {error}</p>}
      {mermaid && (
        <div className="mermaid-container">
          <Mermaid chart={mermaid} />
          <details className="mermaid-source">
            <summary>View Mermaid Source</summary>
            <pre>{mermaid}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default function RightPane() {
  const { rightTab, setRightTab } = useAppStore();
  const tabs: Array<{ key: typeof rightTab; label: string }> = [
    { key: "audio", label: "🎙 Audio" },
    { key: "diagram", label: "📊 Diagram" },
  ];

  return (
    <aside className="right-pane">
      <div className="pane-header">
        <h2 className="pane-title"><span className="pane-icon">✨</span> Studio</h2>
      </div>
      <div className="tab-bar">
        {tabs.map((t) => (
          <button key={t.key} id={`tab-${t.key}`} className={`tab-btn ${rightTab === t.key ? "active" : ""}`} onClick={() => setRightTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {rightTab === "audio" && <AudioTab />}
      {rightTab === "diagram" && <DiagramTab />}
    </aside>
  );
}
