"use client";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { ChatMessage, Citation } from "@/types";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";

interface Props { notebookId: string; systemPrompt?: string; }

const STARTER_PROMPTS = [
  "Summarize the key points from my sources",
  "What are the main arguments or conclusions?",
  "List the most important facts and figures",
  "What questions does this material raise?",
];

function CitationBadge({ citation, index }: { citation: Citation; index: number }) {
  const [open, setOpen] = useState(false);
  const { setHighlightedDocument, toggleLeftPane, leftCollapsed } = useAppStore();

  const handleClick = () => {
    setOpen(!open);
    if (citation.document_id) {
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
            <p className="citation-source-hint">&uarr; Source highlighted in left pane</p>
          )}
        </div>
      )}
    </span>
  );
}

function AssistantAvatar() {
  return (
    <div className="message-avatar avatar-assistant" aria-hidden="true">
      <span className="avatar-nb">nb</span>
    </div>
  );
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <div className="message-avatar avatar-user" aria-hidden="true">
      {initial}
    </div>
  );
}

function MessageBubble({ msg, onCopy, onRegenerate, userInitial }: {
  msg: ChatMessage;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  userInitial: string;
}) {
  return (
    <div className={`message-bubble ${msg.role}`}>
      {msg.role === "user" ? <UserAvatar initial={userInitial} /> : <AssistantAvatar />}
      <div className="message-body">
        {msg.role === "assistant" ? (
          <div className="message-text message-markdown">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          <p className="message-text">{msg.content}</p>
        )}
        {msg.citations && msg.citations.length > 0 && (
          <div className="citations-row">
            {msg.citations.map((c, i) => <CitationBadge key={c.chunk_id} citation={c} index={i} />)}
          </div>
        )}
        <div className="message-meta">
          <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
          {msg.role === "assistant" && (
            <div className="message-actions">
              <button
                className="msg-action-btn"
                onClick={() => onCopy(msg.content)}
                title="Copy response"
              >
                <span className="material-symbols-rounded">content_copy</span>
              </button>
              <button
                className="msg-action-btn"
                onClick={onRegenerate}
                title="Regenerate response"
              >
                <span className="material-symbols-rounded">refresh</span>
              </button>
            </div>
          )}
        </div>
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
  const { messages, isLoading, selectedDocumentIds, documents, addMessage, setMessages, setLoading, clearChat } = useAppStore();
  const [input, setInput] = useState("");
  const [creativity, setCreativity] = useState(0.0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSliderTip, setShowSliderTip] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Try to get user's initial from auth context for avatar
  const userInitial = (typeof window !== "undefined"
    ? (localStorage.getItem("notebook_blue_display_name") ||
       localStorage.getItem("notebook_blue_email") || "U")
    : "U").charAt(0).toUpperCase();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // G1: Load persisted chat history when notebook opens
  useEffect(() => {
    if (!notebookId || historyLoaded) return;
    let cancelled = false;
    ApiService.getChatHistory(notebookId)
      .then((history) => {
        if (!cancelled && history.length > 0) {
          setMessages(history);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoaded(true); });
    return () => { cancelled = true; };
  }, [notebookId, historyLoaded, setMessages]);

  useEffect(() => {
    setHistoryLoaded(false);
  }, [notebookId]);

  const sendMessage = async (overrideQuery?: string) => {
    const query = (overrideQuery ?? input).trim();
    if (!query || isLoading) return;

    const docIds = selectedDocumentIds.size > 0
      ? Array.from(selectedDocumentIds)
      : documents.map((d) => d.id);

    const userMsg: ChatMessage = { id: uuidv4(), role: "user", content: query, timestamp: new Date() };
    addMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await ApiService.chat(query, docIds, creativity, notebookId);
      addMessage({ id: uuidv4(), role: "assistant", content: res.answer, citations: res.citations, timestamp: new Date() });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      addMessage({ id: uuidv4(), role: "assistant", content: detail || "An error occurred. Please try again.", timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Clear this conversation? This cannot be undone.")) return;
    clearChat();
    if (notebookId) {
      try { await ApiService.clearChatHistory(notebookId); } catch { /* silently fail */ }
    }
  };

  // Regenerate: re-send the last user message
  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) sendMessage(lastUser.content);
  };

  const handleCopy = async (content: string, msgId?: string) => {
    try {
      await navigator.clipboard.writeText(content);
      if (msgId) {
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch { /* ignore */ }
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
        <h2 className="pane-title"><span className="pane-icon">{"\uD83D\uDCAC"}</span> Chat</h2>
        <button className="btn-ghost" onClick={handleClear} id="clear-chat-btn">Clear</button>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">{"\uD83D\uDCAC"}</div>
            <h3>Ask anything about your sources</h3>
            <p>{noSources ? "Add sources on the left to start chatting." : "Type a question below, or pick a starter:"}</p>
            {!noSources && (
              <div className="prompt-starters">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    className="prompt-starter-btn"
                    onClick={() => sendMessage(p)}
                    disabled={isLoading}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            userInitial={userInitial}
            onCopy={(content) => handleCopy(content, msg.id)}
            onRegenerate={handleRegenerate}
          />
        ))}
        {isLoading && (
          <div className="message-bubble assistant">
            <AssistantAvatar />
            <div className="message-body"><div className="typing-indicator"><span/><span/><span/></div></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {/* Only show source warning in ONE place (left pane handles the rest) */}
        {noSources && (
          <div className="sandbox-warning">{"\u26A0\uFE0F"} Add at least one source to enable chat</div>
        )}

        {/* Creativity slider */}
        <div className="creativity-bar">
          <div className="creativity-labels">
            <span className="creativity-label-left">Precise</span>
            <span className="creativity-label-center" style={{ color: sliderColor }}>
              Creativity&nbsp;
              <strong>{creativity.toFixed(1)}</strong>
              &nbsp;&mdash;&nbsp;{creativityLabel(creativity)}
            </span>
            <button
              className="slider-info-btn"
              onClick={() => setShowSliderTip(!showSliderTip)}
              title="What does this do?"
              aria-label="Creativity info"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 14 }}>info</span>
            </button>
            <span className="creativity-label-right">Imaginative</span>
          </div>
          {showSliderTip && (
            <p className="slider-tip">
              Controls how closely answers follow your sources. <strong>Precise</strong> = direct citations only. <strong>Imaginative</strong> = synthesized analysis beyond your documents.
            </p>
          )}
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
            onClick={() => sendMessage()}
            disabled={noSources || isLoading || !input.trim()}
          >
            {isLoading ? <div className="spinner" /> : "\u27A4"}
          </button>
        </div>
      </div>
    </main>
  );
}
