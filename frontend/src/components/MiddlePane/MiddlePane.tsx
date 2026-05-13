"use client";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiService } from "@/lib/api";
import { ChatMessage, Citation } from "@/types";
import { v4 as uuidv4 } from "uuid";

function CitationBadge({ citation, index }: { citation: Citation; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="citation-wrapper">
      <button className="citation-badge" id={`citation-${citation.chunk_id}`} onClick={() => setOpen(!open)}>
        [{index + 1}]
      </button>
      {open && (
        <div className="citation-popover">
          <p className="citation-excerpt">&ldquo;{citation.excerpt}&rdquo;</p>
          <p className="citation-id">Chunk: {citation.chunk_id.slice(0, 8)}…</p>
        </div>
      )}
    </span>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`message-bubble ${msg.role}`}>
      <div className="message-avatar">{msg.role === "user" ? "👤" : "🤖"}</div>
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

export default function MiddlePane() {
  const { messages, isLoading, selectedDocumentIds, addMessage, setLoading, clearChat } = useAppStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = { id: uuidv4(), role: "user", content: query, timestamp: new Date() };
    addMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await ApiService.chat(query, Array.from(selectedDocumentIds));
      const botMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: res.answer,
        citations: res.citations,
        timestamp: new Date(),
      };
      addMessage(botMsg);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: err.response?.data?.detail || "An error occurred. Please try again.",
        timestamp: new Date(),
      };
      addMessage(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const noDocsSelected = selectedDocumentIds.size === 0;

  return (
    <main className="middle-pane">
      <div className="pane-header">
        <h2 className="pane-title"><span className="pane-icon">💬</span> Chat</h2>
        <button className="btn-ghost" onClick={clearChat} id="clear-chat-btn">Clear</button>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🔍</div>
            <h3>Ask anything about your sources</h3>
            <p>Select documents on the left, then ask a question.</p>
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
        {noDocsSelected && (
          <div className="sandbox-warning">⚠ Select at least one source document to enable chat</div>
        )}
        <div className="chat-input-row">
          <textarea
            id="chat-input"
            className="chat-input"
            placeholder={noDocsSelected ? "Select sources first…" : "Ask a question about your sources…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={noDocsSelected || isLoading}
            rows={2}
          />
          <button
            id="send-btn"
            className="send-btn"
            onClick={sendMessage}
            disabled={noDocsSelected || isLoading || !input.trim()}
          >
            {isLoading ? <div className="spinner" /> : "↑"}
          </button>
        </div>
      </div>
    </main>
  );
}
