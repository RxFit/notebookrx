"use client";
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { MediaJob } from "@/types";
import dynamic from "next/dynamic";
import NotesTab from "./NotesTab";
import SummarizeTab from "./SummarizeTab";
import StudyGuideTab from "./StudyGuideTab";

const Mermaid = dynamic(() => import("react-mermaid2"), { ssr: false });

interface Props { notebookId: string; }

function AudioTab() {
  const { selectedDocumentIds, documents } = useAppStore();
  const [job, setJob]         = useState<MediaJob | null>(null);
  const [jobId, setJobId]     = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const docIds = selectedDocumentIds.size > 0 ? Array.from(selectedDocumentIds) : documents.map((d) => d.id);

  const startGeneration = async () => {
    if (docIds.length === 0) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setJob({ status: "queued", progress: 0, url: null, error: null });
    const res = await ApiService.startAudioJob(docIds);
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
        ApiService.fetchAudioBlob(jobId)
          .then((url) => setAudioUrl(url))
          .catch((e) => setJob((j) => j ? { ...j, error: `Playback load failed: ${e.message}` } : j));
      } else if (status.status === "error") {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      // Cleanup object URL on unmount to prevent memory leaks
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [polling, jobId, audioUrl]);
  return (
    <div className="tab-content">
      <h3 className="tab-section-title"><span className="material-symbols-rounded" style={{fontSize: "20px", verticalAlign: "middle"}}>mic</span> Podcast Generator</h3>
      <p className="tab-desc">Generate a 2-host podcast from your sources using Gemini TTS. The result is a full audio conversation between two AI hosts.</p>
      <button id="generate-audio-btn" className="action-btn" onClick={startGeneration} disabled={polling || docIds.length === 0}>
        {polling ? "Generating..." : "Generate Podcast"}
      </button>
      {job && (
        <div className="job-status">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${job.progress}%` }} /></div>
          <p className="job-label">{job.status} — {job.progress}%</p>
          {job.error && <p className="job-error">✗ {job.error}</p>}
          {audioUrl && (
            <div className="audio-result">
              <audio controls src={audioUrl} className="audio-player" />
              <a href={audioUrl} download={`podcast-${jobId}.mp3`} className="btn-ghost">Download MP3</a>
            </div>
          )}
          {job.status === "done" && !audioUrl && !job.error && (
            <p className="job-label" style={{ fontStyle: "italic" }}>Loading audio player...</p>
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
  const { selectedDocumentIds, documents } = useAppStore();
  const [prompt, setPrompt]   = useState("");
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const docIds = selectedDocumentIds.size > 0 ? Array.from(selectedDocumentIds) : documents.map((d) => d.id);

  const generate = async () => {
    if (docIds.length === 0) return;
    setLoading(true); setError(null);
    try {
      const res = await ApiService.generateDiagram(docIds, prompt);
      setMermaid(res.mermaid);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Generation failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="tab-content">
      <h3 className="tab-section-title"><span className="material-symbols-rounded" style={{fontSize: "20px", verticalAlign: "middle"}}>account_tree</span> Visual Map</h3>
      <p className="tab-desc">Generate a visual flowchart or concept map from your sources. Optionally describe the type of diagram you want.</p>
      <input id="diagram-prompt" className="diagram-input" placeholder="Optional: describe the diagram (e.g. 'flowchart of the main process')" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button id="generate-diagram-btn" className="action-btn" onClick={generate} disabled={loading || docIds.length === 0}>
        {loading ? "Generating..." : "Generate Visual Map"}
      </button>
      {error && <p className="job-error">✗ {error}</p>}
      {mermaid && (
        <div className="mermaid-container">
          <Mermaid chart={mermaid} />
          <details className="mermaid-source">
            <summary>View Source</summary>
            <pre>{mermaid}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function ImageTab() {
  const { selectedDocumentIds, documents } = useAppStore();
  const [prompt, setPrompt]     = useState("");
  const [job, setJob]           = useState<MediaJob | null>(null);
  const [jobId, setJobId]       = useState<string | null>(null);
  const [polling, setPolling]   = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docIds = selectedDocumentIds.size > 0 ? Array.from(selectedDocumentIds) : documents.map((d) => d.id);

  const generate = async () => {
    if (docIds.length === 0) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    const res = await ApiService.startImageJob(docIds, prompt);
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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      // Cleanup object URL on unmount
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [polling, jobId, imageUrl]);

  return (
    <div className="tab-content">
      <h3 className="tab-section-title"><span className="material-symbols-rounded" style={{fontSize: "20px", verticalAlign: "middle"}}>palette</span> Image Generator</h3>
      <p className="tab-desc">Generate a visual from your sources using Imagen 4.</p>
      <input id="image-prompt" className="diagram-input" placeholder="e.g. 'a diagram of the nervous system'" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button id="generate-image-btn" className="action-btn" onClick={generate} disabled={polling || docIds.length === 0 || !prompt.trim()}>
        {polling ? "Generating..." : "Generate Image"}
      </button>
      {!prompt.trim() && !polling && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Add a prompt above to describe what you&rsquo;d like generated.</p>}
      {job && (
        <div className="job-status">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${job.progress}%` }} /></div>
          <p className="job-label">{job.status} — {job.progress}%</p>
          {job.error && <p className="job-error">✗ {job.error}</p>}
          {job.refined_prompt && !imageUrl && <p className="job-label" style={{ fontStyle: "italic" }}>Prompt: {job.refined_prompt}</p>}
        </div>
      )}
      {imageUrl && (
        <div className="image-result">
          <img src={imageUrl} alt="Imagen generated" className="generated-image" />
          <a href={imageUrl} download={`image-${jobId}.png`} className="btn-ghost">Download PNG</a>
        </div>
      )}
    </div>
  );
}

export default function RightPane({ notebookId }: Props) {
  const { rightTab, setRightTab } = useAppStore();
  const tabs = [
    { key: "notes"     as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>description</span> Notes</> },
    { key: "summary"   as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>summarize</span> Summary</> },
    { key: "study"     as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>school</span> Study Guide</> },
    { key: "audio"     as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>mic</span> Audio</> },
    { key: "diagram"   as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>account_tree</span> Visual Map</> },
    { key: "image"     as const, label: <><span className="material-symbols-rounded" style={{fontSize: "16px"}}>palette</span> Image</> },
  ];

  return (
    <aside className="right-pane">
      <div className="pane-header">
        <h2 className="pane-title"><span className="pane-icon material-symbols-rounded" style={{fontSize: "20px"}}>auto_awesome</span> Studio</h2>
      </div>
      <div className="tab-bar">
        {tabs.map((t) => (
          <button key={t.key} id={`tab-${t.key}`} className={`tab-btn ${rightTab === t.key ? "active" : ""}`} onClick={() => setRightTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {rightTab === "notes"     && <NotesTab notebookId={notebookId} />}
      {rightTab === "summary"   && <SummarizeTab />}
      {rightTab === "study"     && <StudyGuideTab />}
      {rightTab === "audio"     && <AudioTab />}
      {rightTab === "diagram"   && <DiagramTab />}
      {rightTab === "image"     && <ImageTab />}
    </aside>
  );
}
