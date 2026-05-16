"use client";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { ChatMessage, Citation } from "@/types";
import { v4 as uuidv4 } from "uuid";

interface Props { notebookId: string; systemPrompt?: string; }

function CitationBadge({ citation, index }: { citation: Citation; index: number }) {
  const [open, setOpen] = useState(false);
  const { setHighlightedDocument, toggleLeftPane, leftCollapsed } = useAppStore();

  const handleClick = () => {
    setOpen(!open);
    // Jump to source in left pane
    if (citation.document_id) {
      // Auto-expand left pane if collapsed
      if (leftCollapsed) toggleLeftPane();
      setHighlightedDocument(citation.document_id);
    }
  };

  return (
    <span className="citation-wrapper">
      <button
        className="citation-badge"
        id={`citation-${citation.chunk_id}`}
        onClick={handleClick}
        title="Click to jump to source"
      >
        [{index + 1}]
      </button>
      {open && (
        <div className="citation-popover">
          <p className="citation-excerpt">&ldquo;{citation.excerpt}&rdquo;</p>
          <p className="citation-id">Chunk: {citation.chunk_id.slice(0, 8)}&hellip;</p>
          {citation.document_id && (
            <p className="citation-source-hint">↑ Source highlighted in left pane</p>
          )}
        </div>
      )}
    </span>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`message-bubble ${msg.role}`}>
      <div className="message-avatar">{msg.role === "user" ? "🧑" : "🤖"}</div>
      <div className="message-body">
        <p className="message-text">{msg.content}</p>
        {msg.citations && msg.citations.length > 0 && (
          <div className="citations-row">
            {msg.citations.map((c, i) => <CitationBadge key={c.chunk_id} citation={c} index={i} />)}
          </div>
        )}
        <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

function creativityLabel(val: number): string {
  if (val <= 0.1) return "Precise";
  if (val <= 0.3) return "Focused";
  if (val <= 0.5) return "Balanced";
  if (val <= 0.7) return "Expressive";
  if (val <= 0.9) return "Creative";
  return "Imaginative";
}

export default function MiddlePane({ notebookId, systemPrompt }: Props) {
  const { messages, isLoading, selectedDocumentIds, documents, addMessage, setLoading, clearChat } = useAppStore();
  const [input, setInput] = useState("");
  const [creativity, setCreativity] = useState(0.0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const docIds = selectedDocumentIds.size > 0
      ? Array.from(selectedDocumentIds)
      : documents.map((d) => d.id);

    const userMsg: ChatMessage = { id: uuidv4(), role: "user", content: query, timestamp: new Date() };
    addMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await ApiService.chat(query, docIds, creativity);
      addMessage({ id: uuidv4(), role: "assistant", content: res.answer, citations: res.citations, timestamp: new Date() });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      addMessage({ id: uuidv4(), role: "assistant", content: detail || "An error occurred. Please try again.", timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const noSources = documents.length === 0;
  const noSelected = selectedDocumentIds.size === 0 && documents.length > 0;

  const sliderHue = Math.round(220 + creativity * 100);
  const sliderColor = `hsl(${sliderHue}, 80%, 55%)`;

  return (
    <main className="middle-pane">
      <div className="pane-header">
        <h2 className="pane-title"><span className="pane-icon">💬</span> Chat</h2>
        <button className="btn-ghost" onClick={clearChat} id="clear-chat-btn">Clear</button>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <h3>Ask anything about your sources</h3>
            <p>{noSources ? "Add sources on the left to start chatting." : "Type a question below to get started."}</p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        {isLoading && (
          <div className="message-bubble assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-body"><div className="typing-indicator"><span/><span/><span/></div></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {noSources && (
          <div className="sandbox-warning">⚠ Add at least one source to enable chat</div>
        )}
        {noSelected && (
          <div className="sandbox-warning">⚠ No sources selected - select sources on the left</div>
        )}

        {/* 🎨 Creativity slider 🎨 */}
        <div className="creativity-bar">
          <div className="creativity-labels">
            <span className="creativity-label-left">Precise</span>
            <span className="creativity-label-center" style={{ color: sliderColor }}>
              Creativity&nbsp;
              <strong>{creativity.toFixed(1)}</strong>
              &nbsp;&mdash;&nbsp;{creativityLabel(creativity)}
            </span>
            <span className="creativity-label-right">Imaginative</span>
          </div>
          <input
            id="creativity-slider"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={creativity}
            onChange={(e) => setCreativity(parseFloat(e.target.value))}
            className="creativity-slider"
            style={{ "--slider-color": sliderColor } as React.CSSProperties}
            title={`Creativity: ${creativity.toFixed(1)}`}
          />
        </div>

        <div className="chat-input-row">
          <textarea
            id="chat-input"
            className="chat-input"
            placeholder={noSources ? "Add sources first..." : "Ask a question about your sources..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={noSources || isLoading}
            rows={2}
          />
          <button
            id="send-btn"
            className="send-btn"
            onClick={sendMessage}
            disabled={noSources || isLoading || !input.trim()}
          >
            {isLoading ? <div className="spinner" /> : "↑"}
          </button>
        </div>
      </div>
    </main>
  );
}