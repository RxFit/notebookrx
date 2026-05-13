"use client";
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { MediaJob } from "@/types";
import dynamic from "next/dynamic";

const Mermaid = dynamic(() => import("react-mermaid2"), { ssr: false });

function AudioTab() {
  const { selectedDocumentIds } = useAppStore();
  const [job, setJob]         = useState<MediaJob | null>(null);
  const [jobId, setJobId]     = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const startGeneration = async () => {
    if (selectedDocumentIds.size === 0) return;
    // Revoke previous blob URL to free memory
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setJob({ status: "queued", progress: 0, url: null, error: null });
    const res = await ApiService.startAudioJob(Array.from(selectedDocumentIds));
    setJobId(res.job_id);
    setPolling(true);
  };

  useEffect(() => {
    if (!polling || !jobId) return;
    pollRef.current = setInterval(async () => {
      const status = await ApiService.getJobStatus(jobId);
      setJob(status);
      if (status.status === "done") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
        // Fetch MP3 with auth header — browsers cannot add JWT to <audio src> directly
        ApiService.fetchAudioBlob(jobId)
          .then((url) => setAudioUrl(url))
          .catch((e) => setJob((j) => j ? { ...j, error: `Playback load failed: ${e.message}` } : j));
      } else if (status.status === "error") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, jobId]);

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">🎙 Podcast Generator</h3>
      <p className="tab-desc">Generate a 2-host podcast conversation from your selected sources using Gemini TTS.</p>
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

          {/* Audio player + download — uses blob URL with auth, not raw job.url */}
          {audioUrl && (
            <div className="audio-result">
              <audio controls src={audioUrl} className="audio-player" />
              <a href={audioUrl} download={`podcast-${jobId}.mp3`} className="btn-ghost">
                Download MP3
              </a>
            </div>
          )}

          {/* Show fetching indicator while audio loads after completion */}
          {job.status === "done" && !audioUrl && !job.error && (
            <p className="job-label" style={{ fontStyle: "italic" }}>Loading audio player…</p>
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
  const [prompt, setPrompt]   = useState("");
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const generate = async () => {
    if (selectedDocumentIds.size === 0) return;
    setLoading(true); setError(null);
    try {
      const res = await ApiService.generateDiagram(Array.from(selectedDocumentIds), prompt);
      setMermaid(res.mermaid);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Generation failed");
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

function ImageTab() {
  const { selectedDocumentIds } = useAppStore();
  const [prompt, setPrompt]     = useState("");
  const [job, setJob]           = useState<MediaJob | null>(null);
  const [jobId, setJobId]       = useState<string | null>(null);
  const [polling, setPolling]   = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const generate = async () => {
    if (selectedDocumentIds.size === 0) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    const res = await ApiService.startImageJob(Array.from(selectedDocumentIds), prompt);
    setJobId(res.job_id);
    setPolling(true);
    setJob({ status: "queued", progress: 0, url: null, error: null });
  };

  useEffect(() => {
    if (!polling || !jobId) return;
    pollRef.current = setInterval(async () => {
      const status = await ApiService.getJobStatus(jobId);
      setJob(status);
      if (status.status === "done") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
        ApiService.fetchImageBlob(jobId).then((url) => setImageUrl(url));
      } else if (status.status === "error") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, jobId]);

  return (
    <div className="tab-content">
      <h3 className="tab-section-title">🎨 Image Generator</h3>
      <p className="tab-desc">Generate a visual from your sources using Imagen 4. Describe what you want or leave blank.</p>
      <input
        id="image-prompt"
        className="diagram-input"
        placeholder="e.g. 'a diagram of the nervous system', 'a futuristic lab'"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button id="generate-image-btn" className="action-btn" onClick={generate} disabled={polling || selectedDocumentIds.size === 0}>
        {polling ? "Generating…" : "Generate Image"}
      </button>
      {job && (
        <div className="job-status">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          <p className="job-label">{job.status} — {job.progress}%</p>
          {job.error && <p className="job-error">✗ {job.error}</p>}
          {job.refined_prompt && !imageUrl && (
            <p className="job-label" style={{ fontStyle: "italic" }}>Prompt: {job.refined_prompt}</p>
          )}
        </div>
      )}
      {imageUrl && (
        <div className="image-result">
          <img src={imageUrl} alt="Imagen 4 generated" className="generated-image" />
          <a href={imageUrl} download={`image-${jobId}.png`} className="btn-ghost">Download PNG</a>
        </div>
      )}
    </div>
  );
}

export default function RightPane() {
  const { rightTab, setRightTab } = useAppStore();
  const tabs = [
    { key: "audio"   as const, label: "🎙 Audio" },
    { key: "diagram" as const, label: "📊 Diagram" },
    { key: "image"   as const, label: "🎨 Image" },
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
      {rightTab === "audio"   && <AudioTab />}
      {rightTab === "diagram" && <DiagramTab />}
      {rightTab === "image"   && <ImageTab />}
    </aside>
  );
}
